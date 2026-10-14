import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../../lib/api.js';
import { CHAPTERS, PARAMS, REVIEW_STATUS, SLOTS } from '../../lib/review/rules.js';
import { compare, fmt, levy, num, summary, tolText } from '../../lib/review/score.js';
import { WARN_KINDS, parseReport, prepareImport } from '../../lib/review/parse.js';
import { reviewLetterRequest } from '../../lib/mailRequests.js';
import { formatStamp } from '../Notes.jsx';
import { ease } from '../ui.jsx';
import { ReviewPill } from './ReviewPill.jsx';
import { readAuthor } from './ReviewTab.jsx';

const MAX_FILE = 2 * 1024 * 1024;
const CLS_PILL = { good: 'pill-green', bad: 'pill-red', none: 'pill-none' };
const EVENT_TEXT = {
  open: () => 'נפתחה בקרה',
  import: (d) => `נקלט דוח ${SLOTS[d.slot] || ''}${d.file ? ` · ${d.file}` : ''}${d.changed?.length ? ` · ${d.changed.length} ערכים השתנו` : ''}`,
  ref: (d) => `ערך ייחוס ${d.row}: ${d.N ?? '—'}`,
  mark: (d) => `${d.row}: ${d.verdict === 'ok' ? '✓ אושר' : d.verdict === 'no' ? '✗ נדחה' : 'הסימון בוטל'}${d.comment ? ` · ${d.comment}` : ''}`,
  status: (d) => `סטטוס: ${REVIEW_STATUS[d.to]?.label || d.to}`,
  letter_draft: (d) => `נפתחה טיוטת מכתב הוראות${d.via ? ` (${d.via})` : ''}`,
  letter_sent: (d) => `מכתב הוראות נשלח${d.rows ? ` · ${d.rows} שורות` : ''}${d.to ? ` · אל ${d.to}` : ''}${d.via === 'outside' ? ' · מחוץ לאפליקציה' : d.via ? ` · ${d.via}` : ''}`,
  round_open: (d) => `נפתח סבב ${d.round}`,
  approve: () => 'הבדיקה אושרה'
};

async function fileToB64(file) {
  const buf = await file.arrayBuffer();
  let bin = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  let sha = '';
  try { sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join(''); } catch { /* insecure context */ }
  return { buf, b64: btoa(bin), sha };
}

export default function ReviewPage({ ctx, entry, reviewId }) {
  const p = entry.project;
  const [review, setReview] = useState(null);
  const [error, setError] = useState(false);
  const [refEdit, setRefEdit] = useState(false);
  const [dragSlot, setDragSlot] = useState(null);
  const [refDraft, setRefDraft] = useState({});
  const [importMsg, setImportMsg] = useState(null);
  const [author, setAuthor] = useState(readAuthor);
  const fileRef = useRef(null);
  const slotRef = useRef('D');

  const load = useCallback(async () => {
    try { setReview(await ctx.query((k) => api.reviewGet(k, reviewId))); setError(false); }
    catch { setError(true); }
  }, [ctx, reviewId]);
  useEffect(() => { load(); }, [reviewId]); // eslint-disable-line react-hooks/exhaustive-deps

  const params = review?.params || {};
  const marks = review?.marks || {};
  const rows = useMemo(() => PARAMS.map((r) => ({ r, row: params[r.id] || {}, c: compare(r, params[r.id] || {}), m: marks[r.id] || {} })), [params, marks]);
  const sum = useMemo(() => summary(params, marks), [params, marks]);

  if (error) {
    return (
      <div className="state-card">
        <h2 className="display-s">הבקרה לא נמצאה</h2>
        <p>ייתכן שהקישור ישן. אפשר לחזור לרשימת הבקרות של הפרויקט.</p>
        <a className="btn btn-primary" href={`#/p/${p._id}/r`}>לרשימת הבקרות</a>
      </div>
    );
  }
  if (!review) return <div className="loading"><div className="skeleton" /><div className="skeleton" /></div>;

  const opinionIndex = entry.opinions.findIndex((o) => o._id === review.opinion_id);
  const opinion = entry.opinions[opinionIndex] || null;
  const locked = !!review.superseded_by;
  const approved = review.status === 'approved';
  const canWrite = ctx.role !== 'viewer' && !locked && !approved;
  const files = Object.fromEntries((review.files || []).map((f) => [f.slot, f]));
  const rejected = rows.filter((x) => x.m.verdict === 'no');
  const who = () => { const a = author.trim(); try { localStorage.setItem('hashbacha-author', a); } catch { /* storage blocked */ } return a; };

  // Every write: run, refresh the full review (and hb_load through mutate).
  async function act(fn, okText) {
    const res = await ctx.mutate(fn, okText);
    if (res !== null) await load();
    return res;
  }

  function pickFile(slot) { slotRef.current = slot; fileRef.current?.click(); }

  async function onFile(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (file) await importFile(file, slotRef.current);
  }

  function onDrop(e, slot) {
    e.preventDefault(); setDragSlot(null);
    const file = e.dataTransfer?.files?.[0];
    if (file && canWrite) importFile(file, slot);
  }

  async function importFile(file, slot) {
    try {
      if (file.size > MAX_FILE) throw new Error('הקובץ גדול מ־2MB. יש להשתמש בתבנית האחידה בלבד.');
      const XLSX = await import('xlsx');
      const { buf, b64, sha } = await fileToB64(file);
      const wb = XLSX.read(buf, { type: 'array' });
      const rep = parseReport(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }));
      // The "סוג דוח" cell decides the slot; the clicked slot is only a fallback when the cell is empty.
      const picked = slot;
      slot = rep.slot || picked;
      if (!slot) throw new Error('בתא "סוג דוח" צריך להופיע: יזם, עירייה או ייחוס.');
      const rerouted = picked && rep.slot && rep.slot !== picked;
      const { parsed, warn, filled } = prepareImport(rep, slot, p['שם התכנית']);
      const meta = { appraiser: rep.meta['שם השמאי'] || '', date: rep.meta['תאריך השומה'] || '', project: rep.meta['שם הפרויקט'] || '', location: rep.meta['מיקום'] || '', plan: rep.meta['תכנית משביחה'] || '' };
      const res = await act((k) => api.reviewImport(k, review._id, slot, { name: file.name, size: file.size, sha256: sha, content_b64: b64, meta }, parsed, who()), `${SLOTS[slot]}: הדוח נקלט`);
      if (res !== null) {
        setImportMsg({
          ok: true, slot, filled, warn,
          title: `${SLOTS[slot]} נקלט מהקובץ ${file.name}: ${filled} מתוך 22 שדות הוזנו.`,
          note: rerouted ? `בקובץ כתוב "סוג דוח: ${rep.meta['סוג דוח']}", ולכן הוא נקלט במשבצת ${SLOTS[slot]} ולא ב${SLOTS[picked]}.` : !rep.slot ? `בקובץ אין "סוג דוח", ולכן הוא נקלט במשבצת שנבחרה (${SLOTS[slot]}).` : ''
        });
      }
    } catch (err) {
      setImportMsg({ ok: false, title: 'הקובץ לא נקלט.', warn: [{ kind: 'error', text: err.message || 'שגיאה בקריאת הקובץ' }] });
    }
  }

  async function download(f) {
    try {
      const res = await ctx.query((k) => api.reviewFile(k, f._id));
      const a = document.createElement('a');
      a.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.content_b64}`;
      a.download = res.file_name; a.click();
    } catch { ctx.toast('ההורדה נכשלה', 'error'); }
  }

  async function mark(r, verdict, comment) {
    const cur = marks[r.id] || {};
    const v = verdict === undefined ? (cur.verdict || null) : (cur.verdict === verdict ? null : verdict);
    await act((k) => api.reviewMark(k, review._id, r.id, v, comment ?? cur.comment ?? '', who()));
  }

  // "עריכת נתונים": reference value and source, and manual correction of the two reports.
  const EDIT_KEYS = ['D', 'N', 'src', 'M'];
  function startRef() {
    setRefDraft(Object.fromEntries(PARAMS.map((r) => [r.id, Object.fromEntries(EDIT_KEYS.map((k) => [k, params[r.id]?.[k] ?? '']))])));
    setRefEdit(true);
  }
  const changedKeys = (r) => (refEdit ? EDIT_KEYS.filter((k) => String(refDraft[r.id]?.[k] ?? '') !== String(params[r.id]?.[k] ?? '')) : []);
  const refChanged = refEdit ? PARAMS.filter((r) => changedKeys(r).length) : [];
  const cast = (r, raw) => { const t = String(raw).trim(); return r.type !== 'match' && t !== '' && Number.isFinite(num(t)) ? num(t) : t; };
  async function saveRef() {
    const a = who();
    const res = await act(async (k) => {
      for (const r of refChanged) {
        const ch = changedKeys(r); const d = refDraft[r.id];
        if (ch.includes('N') || ch.includes('src')) await api.reviewSetRef(k, review._id, r.id, cast(r, d.N), d.src, a);
        for (const slot of ['D', 'M']) if (ch.includes(slot)) await api.reviewSetValue(k, review._id, r.id, slot, cast(r, d[slot]), params[r.id]?.[slot + 'note'] || '', a);
      }
    }, `${refChanged.length} שורות עודכנו`);
    if (res !== null) setRefEdit(false);
  }
  const setCell = (r, k, v) => setRefDraft({ ...refDraft, [r.id]: { ...refDraft[r.id], [k]: v } });

  // After approval: offer to copy r18 (developer profit) of both reports into the linked opinion.
  async function updateOpinion() {
    const dev = params.r18?.D; const city = params.r18?.M;
    const ok = await ctx.confirm(`לעדכן בחוות הדעת: רווחיות יזם ${dev ?? '—'}%, רווחיות עירייה ${city ?? '—'}%? הערכים לקוחים מ"רווח יזמי" (r18) בשתי השומות.`, 'עדכון חוות הדעת');
    if (!ok || !opinion) return;
    await ctx.mutate((k) => api.saveOpinion(k, p._id, opinion._id, {
      ...opinion, 'רווחיות יזם (%)': dev === '' || dev == null ? opinion['רווחיות יזם (%)'] || '' : `${dev}%`,
      'רווחיות עירייה (%)': city === '' || city == null ? opinion['רווחיות עירייה (%)'] || '' : `${city}%`
    }), 'חוות הדעת עודכנה מהבקרה');
  }

  function openLetter() {
    const letterRows = rejected.map(({ r, row, c, m }) => ({
      chapter: CHAPTERS[r.ch], label: r.label, unit: r.unit,
      value: row.D === '' || row.D == null ? 'חסר' : fmt(row.D), ref: row.N === '' || row.N == null ? 'לא נקבע' : fmt(row.N), src: row.src,
      deviation: c.D.txt, tol: tolText(r, row.N), exceed: c.D.label.startsWith('חריגה'), comment: m.comment
    }));
    ctx.openMail(reviewLetterRequest({
      p, opinion, review, rows: letterRows, settings: ctx.data.settings || {},
      // Called only after the user confirmed in the composer that the letter really went out.
      onSent: async (via, draft) => {
        const note = { via, to: draft.to, rows: letterRows.length, date: new Date().toISOString().slice(0, 10) };
        await act((k) => api.reviewStatus(k, review._id, 'instructions_sent', note, who()), 'מכתב ההוראות סומן כנשלח');
      }
    }));
  }

  // For a letter sent outside the app (e.g. printed or from another mailbox).
  async function markSent() {
    const ok = await ctx.confirm(`לסמן שמכתב ההוראות על ${rejected.length} שורות ✗ נשלח מחוץ לאפליקציה?`, 'סימון כנשלח');
    if (!ok) return;
    const note = { via: 'outside', rows: rejected.length, date: new Date().toISOString().slice(0, 10) };
    await act((k) => api.reviewStatus(k, review._id, 'instructions_sent', note, who()), 'סומן: מכתב ההוראות נשלח');
  }

  async function newRound() {
    const ok = await ctx.confirm('לפתוח סבב חדש לדוח המתוקן? הסבב הנוכחי יינעל לקריאה, וסימונים של שורות שלא ישתנו יעברו לסבב החדש.', 'פתיחת סבב');
    if (!ok) return;
    const id = await ctx.mutate((k) => api.reviewNewRound(k, review._id, who()), 'נפתח סבב חדש');
    if (id && id !== true) window.location.hash = `#/p/${p._id}/r/${id}`;
  }

  async function approve() {
    const ok = await ctx.confirm(`לאשר את הבקרה? כל 22 השורות סומנו ✓. אחרי האישור הבקרה נעולה לשינויים.`, 'אישור הבקרה');
    if (!ok) return;
    await act((k) => api.reviewApprove(k, review._id, who()), 'הבקרה אושרה');
  }

  const rounds = review.rounds || [];
  const status = REVIEW_STATUS[review.status];
  let lastCh = -1;

  return (
    <div className="review-page">
      <section className="panel">
        <a className="back" href={`#/p/${p._id}/r`}>חזרה לרשימת הבקרות</a>
        <div className="panel-head">
          <div>
            <span className="label">בקרת שומת השבחה · חוות דעת {opinionIndex >= 0 ? opinionIndex + 1 : '—'}{opinion?.['תאריך קבלת בקשה'] ? ` מיום ${opinion['תאריך קבלת בקשה']}` : ''} · סבב {review.round}</span>
            <h2 className="display-s">השוואת שומות מול עמודת ייחוס</h2>
            <div className="detail-badges">
              <ReviewPill review={review} />
              {locked && <span className="pill pill-none">סבב קודם · לקריאה בלבד</span>}
              {approved && review.approved_at && <span className="muted">אושר ב־{formatStamp(review.approved_at)}{review.approved_by ? ` · ${review.approved_by}` : ''}</span>}
            </div>
          </div>
          <div className="panel-actions">
            {rounds.length > 1 && (
              <div className="seg-control" role="tablist" aria-label="סבבים">
                {rounds.map((x) => (
                  <a key={x._id} role="tab" aria-selected={x._id === review._id} className={x._id === review._id ? 'on' : ''} href={`#/p/${p._id}/r/${x._id}`}>סבב {x.round}</a>
                ))}
              </div>
            )}
            <label className="inline-field">
              <span className="label">שם הבודק</span>
              <input className="input input-author" value={author} placeholder="שם" aria-label="שם הבודק" onChange={(e) => setAuthor(e.target.value)} />
            </label>
          </div>
        </div>
        <p className="hint">{status ? `מצב: ${status.label}. ` : ''}{nextStep(review, sum, rejected.length)}</p>

        <div className="mail-actions review-slots">
          {['D', 'N', 'M'].map((slot) => {
            const f = files[slot];
            return (
              <div key={slot} className={`review-slot${slot === 'N' ? ' review-slot-ref' : ''}${dragSlot === slot ? ' is-drag' : ''}`}
                onDragOver={(e) => { if (canWrite) { e.preventDefault(); setDragSlot(slot); } }}
                onDragLeave={() => setDragSlot(null)} onDrop={(e) => onDrop(e, slot)}>
                <button className="mail-card" onClick={() => pickFile(slot)} disabled={!canWrite}>
                  <b>{SLOTS[slot]}{slot === 'N' ? ' (לא חובה)' : ''}</b>
                  {f ? <span>{f.file_name}{f.meta?.appraiser ? ` · ${f.meta.appraiser}` : ''}{f.meta?.date ? ` · ${f.meta.date}` : ''}</span>
                    : <span>{slot === 'N' ? 'קובץ ייחוס בתבנית, או הזנה ידנית בטבלה' : 'לא נקלט דוח. לחיצה או גרירת קובץ xlsx בתבנית האחידה'}</span>}
                  {f && canWrite && <span className="label">לחיצה להחלפת הקובץ</span>}
                </button>
                {f && <button className="link-btn" onClick={() => download(f)}>הורדת הקובץ</button>}
              </div>
            );
          })}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={onFile} aria-label="קובץ דוח" />
        </div>
        {canWrite && (
          <div className="file-actions">
            <button className="btn btn-ghost" onClick={() => pickFile(null)}>העלאת דוח · ניתוב לפי "סוג דוח"</button>
            <span className="hint">הקובץ נכנס למשבצת לפי התא "סוג דוח" בקובץ (יזם / ייחוס / עירייה), גם אם נבחרה משבצת אחרת.</span>
          </div>
        )}
        <p className="hint">
          התבנית האחידה: גיליון ראשון, שורות "סוג דוח" (יזם / עירייה / ייחוס), שם הפרויקט, מיקום, תכנית משביחה, שם השמאי ותאריך השומה,
          ואחריהן טבלה שמתחילה ב"קוד" עם 22 השורות r1–r22. <a className="link-btn" href="/templates/template.xlsx" download="תבנית-דוח-שמאי.xlsx">הורדת תבנית ריקה לשמאים</a>
          {' · '}קבצי דוגמה לבדיקה (נתונים בדויים):{' '}
          <a className="link-btn" href="/templates/sample-developer.xlsx" download="דוגמה-שמאי-היזם.xlsx">יזם</a>{' / '}
          <a className="link-btn" href="/templates/sample-reference.xlsx" download="דוגמה-ייחוס.xlsx">ייחוס</a>{' / '}
          <a className="link-btn" href="/templates/sample-municipality.xlsx" download="דוגמה-שמאי-העירייה.xlsx">עירייה</a>
        </p>
        <dl className="facts review-facts">
          {[
            ['שמאי היזם', files.D?.meta?.appraiser || opinion?.['שמאי מטעם היזם']],
            ['שמאי העירייה', files.M?.meta?.appraiser || opinion?.['שמאי מטעם העירייה']],
            ['תאריכי השומות', [files.D?.meta?.date && `יזם ${files.D.meta.date}`, files.M?.meta?.date && `עירייה ${files.M.meta.date}`].filter(Boolean).join(' · ')],
            ['תכנית משביחה', files.D?.meta?.plan || files.M?.meta?.plan || p["מס' תכנית/ מס זמני"]],
            ['מיקום', files.D?.meta?.location || files.M?.meta?.location || p['כתובת הפרויקט']]
          ].map(([k, v]) => <div className="fact" key={k}><dt className="label">{k}</dt><dd className="fact-value">{v || '—'}</dd></div>)}
        </dl>

        <AnimatePresence>
          {importMsg && (
            <motion.div className={`import-msg${importMsg.ok ? '' : ' is-error'}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease }}>
              <b>{importMsg.title}</b>
              {importMsg.note && <span className="hint">{importMsg.note}</span>}
              {importMsg.ok && (
                <dl className="summary import-summary">
                  <div><dt className="label">שדות שהוזנו</dt><dd>{importMsg.filled} / 22</dd></div>
                  {Object.entries(WARN_KINDS).map(([k, l]) => (
                    <div key={k}><dt className="label">{l}</dt><dd className={importMsg.warn.some((w) => w.kind === k) ? 'no-text' : ''}>{importMsg.warn.filter((w) => w.kind === k).length}</dd></div>
                  ))}
                </dl>
              )}
              {importMsg.warn.length > 0 ? (<><span className="label">{importMsg.warn.length} הערות לבדיקה</span><ul className="insights">{importMsg.warn.map((w) => <li key={w.text} data-kind={w.kind}>{w.text}</li>)}</ul></>)
                : <span className="muted">כל השדות הוזנו עם מקור.</span>}
              <button className="btn btn-sm btn-ghost" onClick={() => setImportMsg(null)}>סגירה</button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section className="panel">
        <span className="label">סיכום</span>
        <dl className="summary review-summary">
          <div><dt className="label">שמאי היזם · קרוב לייחוס</dt><dd className="ok-text">{sum.D.good}</dd></div>
          <div><dt className="label">שמאי היזם · חריגות</dt><dd className="no-text">{sum.D.exceed}</dd></div>
          <div><dt className="label">שמאי העירייה · קרוב לייחוס</dt><dd className="ok-text">{sum.M.good}</dd></div>
          <div><dt className="label">שמאי העירייה · חריגות</dt><dd className="no-text">{sum.M.exceed}</dd></div>
          <div><dt className="label">בקרה · אושרו ✓</dt><dd className="ok-text">{sum.ok}</dd></div>
          <div><dt className="label">בקרה · נדחו ✗</dt><dd className="no-text">{sum.no}</dd></div>
          <div><dt className="label">בקרה · ממתינים</dt><dd>{sum.pending}</dd></div>
        </dl>
        <p className="levy-line">
          <span className="label">היטל נגזר (השבחה × שיעור היטל), ₪ מיליון · לא נכלל בציון</span>
          {['D', 'N', 'M'].map((k) => <span key={k}><span className="role">{SLOTS[k]}:</span> <b className="mono">{levy(params, k) === null ? '—' : fmt(levy(params, k))}</b></span>)}
        </p>
        <div className="legend review-legend" role="note">
          <span className="legend-item"><i className="dot dot-green" />קרוב יותר לייחוס, או בטווח הקביל</span>
          <span className="legend-item"><i className="dot dot-red" />רחוק יותר, או חריגה מהטווח</span>
          <span className="legend-item"><i className="dot dot-none" />חסר ערך או אין ייחוס</span>
          <span className="legend-item muted">הסרגל: הקו האמצעי הוא ערך הייחוס, והנקודה היא ערך השמאי</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="label">22 פרמטרים ב־7 פרקים · כל שורה מסומנת ✓ או ✗ עם הערה</span>
            <h2 className="display-s">טבלת ההשוואה</h2>
          </div>
          <div className="panel-actions">
            {canWrite && !refEdit && <button className="btn btn-ghost" onClick={startRef}>עריכת נתונים</button>}
            <button className="btn btn-ghost" onClick={openLetter} disabled={!rejected.length || !canWrite}>מכתב הוראות ({rejected.length})</button>
            {rejected.length > 0 && canWrite && review.status === 'in_review' && <button className="btn btn-ghost btn-quiet" onClick={markSent}>נשלח מחוץ לאפליקציה</button>}
            {review.status === 'instructions_sent' && canWrite && <button className="btn btn-ghost" onClick={newRound}>סבב חדש לדוח מתוקן</button>}
            {approved && opinion && ctx.role === 'editor' && <button className="btn btn-ghost" onClick={updateOpinion}>עדכון רווחיות בחוות הדעת</button>}
            {!approved && <button className="btn btn-primary" onClick={approve} disabled={!canWrite || sum.ok !== 22}>אישור הבקרה</button>}
          </div>
        </div>
        <div className="table-wrap">
          <table className="table table-review">
            <thead>
              <tr>
                <th>פרמטר</th>
                <th>שמאי היזם</th>
                <th className="col-ref">ייחוס ומקור</th>
                <th>שמאי העירייה</th>
                <th>טווח קביל</th>
                <th>בקרה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, row, c, m }) => {
                const head = r.ch !== lastCh ? (lastCh = r.ch, true) : false;
                return (
                  <React.Fragment key={r.id}>
                    {head && <tr className="group-row"><td colSpan={6}><span className="group-label">{CHAPTERS[r.ch]}</span></td></tr>}
                    <tr className={`row${refEdit ? ' row-edit' : ''}`} data-row={r.id}>
                      <td data-label="פרמטר"><span className="project-name">{r.label}</span><span className="project-sub">{r.unit} · <span className="mono">{r.id}</span></span></td>
                      <td data-label="שמאי היזם">{refEdit
                        ? <input className="input input-cell" dir="ltr" aria-label={`יזם ${r.label}`} value={refDraft[r.id]?.D ?? ''} onChange={(e) => setCell(r, 'D', e.target.value)} />
                        : <SideCell v={row.D} note={row.Dnote} s={c.D} />}</td>
                      <td data-label="ייחוס ומקור" className="col-ref">
                        {refEdit ? (
                          <div className="ref-edit">
                            <input className="input input-cell" dir="ltr" aria-label={`ייחוס ${r.label}`} value={refDraft[r.id]?.N ?? ''} onChange={(e) => setCell(r, 'N', e.target.value)} />
                            <input className="input input-cell" aria-label={`מקור ${r.label}`} placeholder="מקור" value={refDraft[r.id]?.src ?? ''} onChange={(e) => setCell(r, 'src', e.target.value)} />
                          </div>
                        ) : (
                          <div className="ref-cell"><b className="mono">{row.N === '' || row.N == null ? '—' : fmt(row.N)}</b><span className="hint">{row.src || 'ללא מקור'}</span></div>
                        )}
                      </td>
                      <td data-label="שמאי העירייה">{refEdit
                        ? <input className="input input-cell" dir="ltr" aria-label={`עירייה ${r.label}`} value={refDraft[r.id]?.M ?? ''} onChange={(e) => setCell(r, 'M', e.target.value)} />
                        : <SideCell v={row.M} note={row.Mnote} s={c.M} />}</td>
                      <td data-label="טווח קביל" className="mono tol-cell">{tolText(r, row.N)}</td>
                      <td data-label="בקרה"><MarkCell m={m} canWrite={canWrite} onMark={(v, comment) => mark(r, v, comment)} label={r.label} /></td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <span className="label">יומן הבקרה · מהחדש לישן</span>
        {!(review.events || []).length ? <p className="muted">אין עדיין אירועים.</p> : (
          <ol className="file-timeline">
            {review.events.map((ev, i) => (
              <li key={i} className={`ft ft-${ev.kind === 'mark' || ev.kind === 'ref' ? 'note' : ev.kind.startsWith('letter') ? 'mail_out' : 'event'}`}>
                <span className="ft-date mono">{formatStamp(ev.at)}</span>
                <span className="ft-who">{ev.actor || 'ללא שם'}</span>
                <span className="ft-text">{(EVENT_TEXT[ev.kind] || (() => ev.kind))(ev.detail || {})}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <AnimatePresence>
        {refEdit && (
          <motion.div className="editbar" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ duration: 0.4, ease }} role="region" aria-label="סרגל עריכה">
            <span className="editbar-state"><span className={`sync-dot${refChanged.length ? ' on' : ''}`} />{refChanged.length ? `${refChanged.length} שורות שונו` : 'עריכת נתונים · אין שינויים'}</span>
            <button className="btn btn-primary" onClick={saveRef} disabled={!refChanged.length}>שמור נתונים</button>
            <button className="btn btn-ghost btn-on-dark" onClick={() => setRefEdit(false)}>ביטול</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function nextStep(review, sum, rejected) {
  if (review.superseded_by) return 'זהו סבב קודם. הבדיקה ממשיכה בסבב החדש.';
  switch (review.status) {
    case 'waiting_for_reports': return 'הצעד הבא: לקלוט את דוח שמאי היזם ואת דוח שמאי העירייה.';
    case 'reports_imported': return 'הצעד הבא: לקבוע ערכי ייחוס עם מקור, ולסמן ✓ או ✗ בכל שורה.';
    case 'in_review': return rejected ? `הצעד הבא: ${sum.pending ? `לסמן עוד ${sum.pending} שורות, ואז ` : ''}לשלוח מכתב הוראות על ${rejected} שורות ✗.` : sum.pending ? `נותרו ${sum.pending} שורות לסימון.` : 'כל השורות ✓. אפשר לאשר את הבקרה.';
    case 'instructions_sent': return 'ההוראות נשלחו. כשמגיע דוח מתוקן: "סבב חדש לדוח מתוקן", ואז קליטת הדוח.';
    case 'revised_report_received': return 'התקבל דוח מתוקן. שורות שערכן השתנה חזרו לסימון.';
    case 'approved': return 'הבקרה אושרה ונעולה לשינויים.';
    default: return '';
  }
}

function SideCell({ v, note, s }) {
  const has = !(v === '' || v == null);
  return (
    <div className={`side-cell side-${s.cls}`}>
      <span className="side-top">
        <b className="mono">{has ? fmt(v) : '—'}</b>
        {s.label && <span className={`pill ${CLS_PILL[s.cls]}`}>{s.label}</span>}
      </span>
      {s.txt && <span className="hint">{s.txt}</span>}
      {s.pos != null && (
        <span className="pair-track side-scale" aria-hidden="true">
          <span className="pair-mark" />
          <span className="side-dot" style={{ insetInlineStart: `${s.pos}%` }} />
        </span>
      )}
      {note && <span className="side-note">{note}</span>}
    </div>
  );
}

function MarkCell({ m, canWrite, onMark, label }) {
  const [comment, setComment] = useState(m.comment || '');
  useEffect(() => { setComment(m.comment || ''); }, [m.comment]);
  return (
    <div className="mark-cell">
      <div className="row-actions">
        <button className={`btn btn-sm btn-ghost mark-ok${m.verdict === 'ok' ? ' on' : ''}`} aria-pressed={m.verdict === 'ok'} aria-label={`אישור ${label}`} disabled={!canWrite} onClick={() => onMark('ok', comment)}>✓ אישור</button>
        <button className={`btn btn-sm btn-ghost mark-no${m.verdict === 'no' ? ' on' : ''}`} aria-pressed={m.verdict === 'no'} aria-label={`דחייה ${label}`} disabled={!canWrite} onClick={() => onMark('no', comment)}>✗ דחייה</button>
      </div>
      <textarea className="input" rows={2} placeholder="הערה" aria-label={`הערה ${label}`} value={comment} readOnly={!canWrite}
        onChange={(e) => setComment(e.target.value)} onBlur={() => { if (canWrite && comment !== (m.comment || '')) onMark(undefined, comment); }} />
      <span className="label">{m.marked_at ? `עודכן ${formatStamp(m.marked_at)}${m.reviewer ? ` · ${m.reviewer}` : ''}${m.carried_from ? ' · הועבר מסבב קודם' : ''}` : 'טרם נבדק'}</span>
    </div>
  );
}

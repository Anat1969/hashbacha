import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../lib/api.js';
import { OPINION_FIELDS, PROJECT_FIELDS, STATUS_OPTIONS } from '../lib/fields.js';
import {
  FOLLOW_OPTIONS, daysBetween, followUp, formatDuration, isRange, missingReportFields, parseDate, parsePercent,
  profitColor, stampNotes
} from '../lib/calc.js';
import { missingDetailsRequest, newProjectRequest, opinionReadyRequest, reminderRequest } from '../lib/mailRequests.js';
import { PROFIT_THRESHOLD } from '../lib/config.js';
import { StatusPill, ease } from './ui.jsx';
import { BenchmarkLegend } from './Legend.jsx';
import { ProfitPair } from './ProjectsView.jsx';
import { NoteComposer, NoteList, formatStamp } from './Notes.jsx';

const F = Object.fromEntries(OPINION_FIELDS.map((f) => [f.key, f]));
const projectName = (p) => p['שם התכנית'] || p['כתובת הפרויקט'] || 'ללא שם';

export default function ProjectDetail({ ctx, entry }) {
  const p = entry.project;
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(p);
  const [editingOp, setEditingOp] = useState(null); // opinion id | '__new__'
  const [opDraft, setOpDraft] = useState({});

  useEffect(() => { if (!editMode) setDraft(p); }, [p, editMode]);

  const dirty = useMemo(() => PROJECT_FIELDS.filter((f) => (draft[f.key] || '') !== (p[f.key] || '')).length, [draft, p]);
  const settings = ctx.data.settings || {};
  const follow = followUp(entry);
  const latest = entry.opinions[entry.opinions.length - 1] || null;
  const latestDevOp = [...entry.opinions].reverse().find((o) => parsePercent(o['רווחיות יזם (%)']) !== null);
  const latestCityOp = [...entry.opinions].reverse().find((o) => parsePercent(o['רווחיות עירייה (%)']) !== null);
  const notes = (ctx.data.notes || []).filter((n) => n.project_id === p._id);
  const missing = missingReportFields(latest);

  async function saveProject() {
    const res = await ctx.mutate((k) => api.saveProject(k, p._id, draft), 'הפרויקט עודכן');
    if (res !== null) setEditMode(false);
  }

  async function removeProject() {
    const ok = await ctx.confirm(`להעביר את "${projectName(p)}" לסל המחזור? אפשר לשחזר בכל עת.`, 'העבר לסל');
    if (!ok) return;
    const res = await ctx.mutate((k) => api.removeProject(k, p._id));
    if (res !== null) {
      window.location.hash = '#/';
      ctx.toast('הפרויקט הועבר לסל', 'ok', {
        label: 'בטל',
        onClick: () => ctx.mutate((k) => api.restoreProject(k, p._id), 'הפרויקט שוחזר')
      });
    }
  }

  function startOp(o) {
    if (editingOp) { ctx.toast('יש לסיים את העריכה הפתוחה קודם', 'error'); return; }
    setEditingOp(o ? o._id : '__new__');
    setOpDraft(o ? { ...o } : {});
  }

  async function saveOp() {
    const isNew = editingOp === '__new__';
    const original = isNew ? '' : (entry.opinions.find((o) => o._id === editingOp)?.['הערות / סטטוס'] || '');
    const data = { ...opDraft };
    OPINION_FIELDS.forEach((f) => { if (data[f.key] === undefined) data[f.key] = ''; });
    data['הערות / סטטוס'] = stampNotes(original, data['הערות / סטטוס']);
    const res = await ctx.mutate(
      (k) => api.saveOpinion(k, p._id, isNew ? null : editingOp, data),
      isNew ? 'חוות הדעת נוספה' : 'חוות הדעת עודכנה'
    );
    if (res !== null) setEditingOp(null);
  }

  async function removeOp(o, i) {
    const ok = await ctx.confirm(`למחוק את חוות דעת מס׳ ${i + 1}?`);
    if (!ok) return;
    await ctx.mutate((k) => api.removeOpinion(k, o._id), 'חוות הדעת נמחקה');
  }

  async function setFollowWho(who) {
    if (!latest) return;
    await ctx.mutate((k) => api.saveOpinion(k, p._id, latest._id, { ...latest, 'ממתין ל': who }), 'גורם המעקב עודכן');
  }

  return (
    <div className="page page-detail">
      <a className="back" href="#/">חזרה לכל הפרויקטים</a>

      <section className="detail-hero">
        <div className="detail-title">
          <span className="label">רובע {p['רובע'] || '—'} · {p["מס' תכנית/ מס זמני"] || 'ללא מס׳ תכנית'}</span>
          <h1 className="display-l project-title">{projectName(p)}</h1>
          <p className="lead"><span className="role">יזם:</span> {p['שם היזם'] || '—'}{p['כתובת הפרויקט'] && p['שם התכנית'] ? ` · ${p['כתובת הפרויקט']}` : ''}</p>
          <div className="detail-badges">
            <StatusPill value={p['סטטוס רמזור']} />
            {p['קישור'] && <a className="chip" href={p['קישור']} target="_blank" rel="noreferrer">קישור לתכנית</a>}
          </div>
        </div>
        <div className="detail-figures">
          <div className="figure figure-wide">
            <span className="label">רווחיות אחרונה · יזם מול עירייה · בנצ'מרק {PROFIT_THRESHOLD}%</span>
            <ProfitPair dev={latestDevOp ? parsePercent(latestDevOp['רווחיות יזם (%)']) : null} city={latestCityOp ? parsePercent(latestCityOp['רווחיות עירייה (%)']) : null} />
          </div>
          <div className="figure">
            <span className="label">חוות דעת</span>
            <span className="figure-value">{entry.opinions.length}</span>
          </div>
          <Trend opinions={entry.opinions} />
        </div>
      </section>

      <section className={`panel panel-follow${follow ? ' is-open' : ''}`}>
        <div className="panel-head">
          <div>
            <span className="label">גורם מעקב</span>
            <h2 className="display-s">
              {follow ? <>ממתין ל{follow.who}{follow.name ? `: ${follow.name}` : ''}</> : 'אין בקשה פתוחה'}
            </h2>
            {follow && (
              <p className="muted follow-line">
                הבקשה הועברה ב־{follow.opinion['תאריך קבלת בקשה']} · ממתינה <b>{formatDuration(follow.days)}</b>
                {follow.inferred && ' · גורם המעקב הוסק מההערות. אפשר לקבוע אותו במפורש:'}
              </p>
            )}
          </div>
          <div className="panel-actions">
            {follow && (
              <>
                <select className="input select" aria-label="ממתין ל" value={latest?.['ממתין ל'] || ''} onChange={(e) => setFollowWho(e.target.value)}>
                  <option value="">ממתין ל… (אוטומטי)</option>
                  {FOLLOW_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <button className="btn btn-primary" onClick={() => ctx.openMail(reminderRequest(p, follow, settings))}>מייל תזכורת ל{follow.who}</button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="label">פרטי הפרויקט</span>
            <h2 className="display-s">כרטיס פרויקט</h2>
          </div>
          <div className="panel-actions">
            {!editMode && <button className="btn btn-ghost" onClick={() => setEditMode(true)}>עריכת פרטים</button>}
            <button className="btn btn-ghost btn-quiet" onClick={removeProject}>מחיקת פרויקט</button>
          </div>
        </div>
        <div className={`facts${editMode ? ' facts-edit' : ''}`}>
          {PROJECT_FIELDS.map((f) => (
            <div className="fact" key={f.key}>
              <span className="label">{f.label}</span>
              {editMode ? (
                f.type === 'status' ? (
                  <select className="input" value={draft[f.key] || ''} aria-label={f.label}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}>
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input className="input" aria-label={f.label} dir={f.type === 'url' ? 'ltr' : undefined}
                    value={draft[f.key] || ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                )
              ) : (
                <span className={`fact-value${f.key === 'שם התכנית' ? ' project-name' : ''}`}>
                  {f.type === 'status' ? <StatusPill value={p[f.key]} />
                    : f.type === 'url' && p[f.key] ? <a href={p[f.key]} target="_blank" rel="noreferrer" dir="ltr">{p[f.key]}</a>
                    : (p[f.key] || '—')}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="label">מיילים מוכנים · כל מייל נפתח לעריכה לפני שליחה</span>
            <h2 className="display-s">תקשורת</h2>
          </div>
        </div>
        <div className="mail-actions">
          <button className="mail-card" onClick={() => ctx.openMail(newProjectRequest(p, settings))}>
            <b>לאילנית: פרויקט חדש</b>
            <span>בקשה לשיבוץ שמאי מטעם העירייה</span>
          </button>
          <button className="mail-card" onClick={() => ctx.openMail(opinionReadyRequest(p, settings, latest))}>
            <b>לאגף תכנון: התקבלה חוות דעת</b>
            <span>כולל שמאי, תאריך ורווחיות של שני הצדדים</span>
          </button>
          <button className="mail-card" onClick={() => ctx.openMail(missingDetailsRequest(p, latest, settings))}>
            <b>לשמאי היזם וליזם: השלמת פרטים</b>
            <span>{missing.length ? `חסרים ${missing.length} פרטים: ${missing.slice(0, 2).map((m) => m.label).join(', ')}${missing.length > 2 ? '…' : ''}` : 'לא זוהו פרטים חסרים בחוות הדעת האחרונה'}</span>
          </button>
          {follow && (
            <button className="mail-card" onClick={() => ctx.openMail(reminderRequest(p, follow, settings))}>
              <b>תזכורת ל{follow.who}</b>
              <span>ממתין {formatDuration(follow.days)}</span>
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="label">רצף בקשות וחוות דעת</span>
            <h2 className="display-s">חוות דעת</h2>
          </div>
          <div className="panel-actions">
            <button className="btn btn-primary" onClick={() => startOp(null)}>חוות דעת חדשה</button>
          </div>
        </div>
        <BenchmarkLegend compact />
        <div className="opinion-list">
          {entry.opinions.map((o, i) => (
            editingOp === o._id
              ? <OpinionForm key={o._id} n={i + 1} draft={opDraft} setDraft={setOpDraft} onSave={saveOp} onCancel={() => setEditingOp(null)} />
              : <OpinionCard key={o._id} o={o} n={i + 1} onEdit={() => startOp(o)} onDelete={() => removeOp(o, i)} />
          ))}
          {editingOp === '__new__' && (
            <OpinionForm n={entry.opinions.length + 1} draft={opDraft} setDraft={setOpDraft} onSave={saveOp} onCancel={() => setEditingOp(null)} isNew />
          )}
          {entry.opinions.length === 0 && editingOp !== '__new__' && (
            <div className="empty"><p>אין עדיין חוות דעת. הוסיפו את הבקשה הראשונה.</p></div>
          )}
        </div>
        <p className="hint">טקסט שנוסף להערות מתויג אוטומטית בתאריך היום. רווחיות בטווח (למשל 10%–16%) מחושבת לפי אמצע הטווח.</p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="label">כל ההערות, המשימות והאירועים של הפרויקט במקום אחד</span>
            <h2 className="display-s">תיק הפרויקט</h2>
          </div>
        </div>
        <NoteComposer ctx={ctx} projectId={p._id} placeholder="הערה לתיק הפרויקט. תישמר עם תאריך ושם הכותב." />
        <div className="file-grid">
          <div>
            <span className="label">הערות ומשימות</span>
            <NoteList ctx={ctx} notes={notes} empty="אין עדיין הערות לתיק. הערות מהיומן שתויקו לפרויקט יופיעו כאן." />
          </div>
          <div>
            <span className="label">ציר זמן מלא</span>
            <FileTimeline entry={entry} notes={notes} />
          </div>
        </div>
      </section>

      <AnimatePresence>
        {editMode && (
          <motion.div
            className="editbar"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.4, ease }}
            role="region"
            aria-label="סרגל עריכה"
          >
            <span className="editbar-state">
              <span className={`sync-dot${dirty ? ' on' : ''}`} />
              {dirty ? `${dirty} שדות שונו` : 'מצב עריכה · אין שינויים'}
            </span>
            <button className="btn btn-primary" onClick={saveProject} disabled={!dirty}>שמור שינויים</button>
            <button className="btn btn-ghost btn-on-dark" onClick={() => { setDraft(p); setEditMode(false); }}>ביטול</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Pct({ v }) {
  const n = parsePercent(v);
  if (!v) return <span className="muted">—</span>;
  return (
    <span className="mono" style={{ color: profitColor(n) }}>
      {v}{isRange(v) && <span className="range-tag">טווח</span>}
    </span>
  );
}

function OpinionCard({ o, n, onEdit, onDelete }) {
  const req = parseDate(o['תאריך קבלת בקשה']);
  const got = parseDate(o['תאריך קבלת חוו"ד']);
  const span = req && got && got >= req ? daysBetween(req, got) : null;
  const dev = parsePercent(o['רווחיות יזם (%)']);
  const city = parsePercent(o['רווחיות עירייה (%)']);
  const extra = [['ממתין ל', o['ממתין ל']], ['יח׳ קיימות', o['מס יחידות קימיות']], ['יח׳ בתכנית', o['סה"כ יחידות בתכנית']], ['דו״ח מעודכן', o['דו"ח אחרון מעודכן']], ['מימוש', o['מימוש']], ['ת.ב.', o['ת.ב.']], ['שמאי לתבע', o['שמאי לתבע']]]
    .filter(([, v]) => String(v || '').trim());
  return (
    <motion.article className="opinion-card" layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}>
      <header className="opinion-head">
        <span className="opinion-num mono">{String(n).padStart(2, '0')}</span>
        <div className="opinion-dates">
          <span><span className="role">בקשה:</span> <span className="mono">{o['תאריך קבלת בקשה'] || '—'}</span></span>
          <span className="arrow-sep">←</span>
          <span><span className="role">חוו״ד:</span> <span className="mono">{o['תאריך קבלת חוו"ד'] || 'טרם התקבלה'}</span></span>
          {span !== null && <span className="opinion-span">משך טיפול: {formatDuration(span)}</span>}
        </div>
        <div className="row-actions">
          <button className="btn btn-sm btn-ghost" onClick={onEdit}>ערוך</button>
          <button className="btn btn-sm btn-ghost btn-quiet" onClick={onDelete}>מחק</button>
        </div>
      </header>
      <div className="opinion-body">
        <div className="opinion-people">
          <span><span className="role">שמאי יזם:</span> {o['שמאי מטעם היזם'] || '—'}</span>
          <span><span className="role">שמאי עירייה:</span> {o['שמאי מטעם העירייה'] || '—'}</span>
        </div>
        <div className="opinion-profit">
          <ProfitPair dev={dev} city={city} />
          {(isRange(o['רווחיות יזם (%)']) || isRange(o['רווחיות עירייה (%)'])) && (
            <span className="hint">מקור: יזם <Pct v={o['רווחיות יזם (%)']} /> · עירייה <Pct v={o['רווחיות עירייה (%)']} /></span>
          )}
        </div>
        {extra.length > 0 && (
          <dl className="opinion-extra">
            {extra.map(([k, v]) => <div key={k}><dt className="label">{k}</dt><dd>{v}</dd></div>)}
          </dl>
        )}
        {o['הערות / סטטוס'] && <p className="opinion-notes">{o['הערות / סטטוס']}</p>}
      </div>
    </motion.article>
  );
}

function OpinionForm({ n, draft, setDraft, onSave, onCancel, isNew }) {
  const set = (k, v) => setDraft({ ...draft, [k]: v });
  const groups = [
    ['שמאים', ['שמאי מטעם היזם', 'שמאי מטעם העירייה']],
    ['תאריכים', ['תאריך קבלת בקשה', 'תאריך קבלת חוו"ד', 'דו"ח אחרון מעודכן']],
    ['רווחיות ויחידות', ['רווחיות יזם (%)', 'רווחיות עירייה (%)', 'מס יחידות קימיות', 'סה"כ יחידות בתכנית']],
    ['מעקב', ['ממתין ל', 'מימוש', 'ת.ב.', 'שמאי לתבע']]
  ];
  const dev = parsePercent(draft['רווחיות יזם (%)']);
  const city = parsePercent(draft['רווחיות עירייה (%)']);
  return (
    <article className={`opinion-card opinion-form${isNew ? ' opinion-new' : ''}`}>
      <header className="opinion-head">
        <span className="opinion-num mono">{String(n).padStart(2, '0')}</span>
        <b>{isNew ? 'חוות דעת חדשה' : 'עריכת חוות דעת'}</b>
        <span className="spacer" />
        <ProfitPair dev={dev} city={city} compact />
      </header>
      {groups.map(([title, keys]) => (
        <fieldset key={title} className="form-group">
          <legend className="label">{title}</legend>
          <div className="form-grid">
            {keys.map((k) => {
              const f = F[k];
              return (
                <label key={k} className="field">
                  <span className="label">{k === 'שמאי מטעם היזם' ? 'שמאי מטעם היזם' : k === 'שמאי מטעם העירייה' ? 'שמאי מטעם העירייה' : f.label}</span>
                  {f.type === 'follow' ? (
                    <select className="input" aria-label={f.label} value={draft[k] || ''} onChange={(e) => set(k, e.target.value)}>
                      <option value="">אוטומטי לפי ההערות</option>
                      {FOLLOW_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  ) : (
                    <input className="input" aria-label={f.label} placeholder={f.placeholder || ''}
                      dir={f.type === 'date' || f.type === 'pct' || f.type === 'num' ? 'ltr' : undefined}
                      value={draft[k] || ''} onChange={(e) => set(k, e.target.value)} />
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <label className="field">
        <span className="label">הערות / סטטוס</span>
        <textarea className="input" aria-label="הערות / סטטוס" rows={3} value={draft['הערות / סטטוס'] || ''} onChange={(e) => set('הערות / סטטוס', e.target.value)} />
      </label>
      <div className="form-actions">
        <button className="btn btn-primary" onClick={onSave}>שמור חוות דעת</button>
        <button className="btn btn-ghost" onClick={onCancel}>ביטול</button>
      </div>
    </article>
  );
}

// Merges opinion events, dated note lines inside opinions, and project notes into one chronology.
function FileTimeline({ entry, notes }) {
  const items = [];
  entry.opinions.forEach((o, i) => {
    const req = parseDate(o['תאריך קבלת בקשה']);
    const got = parseDate(o['תאריך קבלת חוו"ד']);
    if (req) items.push({ d: req, kind: 'event', text: `התקבלה בקשה (חוו״ד ${i + 1})${o['שמאי מטעם היזם'] ? `, שמאי יזם: ${o['שמאי מטעם היזם']}` : ''}${o['רווחיות יזם (%)'] ? `, רווחיות לפי היזם ${o['רווחיות יזם (%)']}` : ''}` });
    if (got) items.push({ d: got, kind: 'event', text: `התקבלה חוות דעת ${i + 1}${o['שמאי מטעם העירייה'] ? `, שמאי עירייה: ${o['שמאי מטעם העירייה']}` : ''}${o['רווחיות עירייה (%)'] ? `, רווחיות לפי העירייה ${o['רווחיות עירייה (%)']}` : ''}` });
    String(o['הערות / סטטוס'] || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((line) => {
      const m = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4}):\s*(.*)$/);
      const d = m ? parseDate(m[1]) : (got || req);
      items.push({ d, kind: 'opnote', text: m ? m[2] : line, who: `הערה בחוו״ד ${i + 1}` });
    });
  });
  notes.forEach((n) => items.push({ d: new Date(n.created_at), kind: 'note', text: n.body, who: n.author ? `${n.author}` : 'הערה' }));
  items.sort((a, b) => (b.d ? b.d.getTime() : 0) - (a.d ? a.d.getTime() : 0));
  if (!items.length) return <p className="muted">אין עדיין אירועים.</p>;
  return (
    <ol className="file-timeline">
      {items.map((it, i) => (
        <li key={i} className={`ft ft-${it.kind}`}>
          <span className="ft-date mono">{it.d ? formatStamp(it.d.toISOString()) : 'ללא תאריך'}</span>
          <span className="ft-text">{it.who && <span className="role">{it.who}: </span>}{it.text}</span>
        </li>
      ))}
    </ol>
  );
}

// Developer profitability across the opinion sequence, against the benchmark line.
function Trend({ opinions }) {
  const pts = opinions.map((o) => parsePercent(o['רווחיות יזם (%)'])).filter((v) => v !== null);
  if (pts.length < 2) {
    return (
      <div className="figure figure-trend">
        <span className="label">מגמת רווחיות יזם</span>
        <span className="muted">נדרשות שתי חוות דעת עם רווחיות לפחות</span>
      </div>
    );
  }
  const W = 220, H = 64, max = Math.max(25, ...pts), min = 0;
  const x = (i) => W - (i / (pts.length - 1)) * W; // RTL: first opinion on the right
  const y = (v) => H - ((v - min) / (max - min)) * H;
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(pts.length - 1)},${H} L${x(0)},${H} Z`;
  return (
    <div className="figure figure-trend">
      <span className="label">מגמת רווחיות יזם לאורך חוות הדעת</span>
      <svg viewBox={`0 0 ${W} ${H}`} className="trend" role="img" aria-label="מגמת רווחיות לאורך חוות הדעת">
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={y(PROFIT_THRESHOLD)} y2={y(PROFIT_THRESHOLD)} className="trend-threshold" />
        <path d={area} fill="url(#trendFill)" />
        <motion.path d={d} className="trend-line" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease }} />
        {pts.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.5" className="trend-dot" style={{ fill: profitColor(v) }} />)}
      </svg>
      <span className="label">קו מקווקו: בנצ'מרק {PROFIT_THRESHOLD}% · ימין: הראשונה</span>
    </div>
  );
}


import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../lib/api.js';
import { PROJECT_FIELDS, STATUS_OPTIONS } from '../lib/fields.js';
import {
  followUp, formatDuration, gapColor, matchKeywords, overview, parseDate, parsePercent, profitColor, SIDE
} from '../lib/calc.js';
import { exportExcel, parseExcel } from '../lib/excel.js';
import { reminderRequest } from '../lib/mailRequests.js';
import { Field, Modal, StatusPill, ease } from './ui.jsx';
import { BenchmarkLegend } from './Legend.jsx';
import { PROFIT_THRESHOLD } from '../lib/config.js';
import { ReviewPill, reviewOf } from './review/ReviewPill.jsx';
import { REVIEW_STATUS } from '../lib/review/rules.js';

const latestOpinion = (e) => e.opinions[e.opinions.length - 1] || null;
const latestWith = (e, key) => {
  for (let i = e.opinions.length - 1; i >= 0; i--) if (String(e.opinions[i][key] || '').trim()) return e.opinions[i];
  return null;
};
const latestDev = (e) => { const o = latestWith(e, 'רווחיות יזם (%)'); return o ? parsePercent(o['רווחיות יזם (%)']) : null; };
const latestCity = (e) => { const o = latestWith(e, 'רווחיות עירייה (%)'); return o ? parsePercent(o['רווחיות עירייה (%)']) : null; };
const projectName = (p) => p['שם התכנית'] || p['כתובת הפרויקט'] || 'ללא שם';

const COLS = [
  { key: 'רובע', label: 'רובע' },
  { key: 'שם התכנית', label: 'שם הפרויקט' },
  { key: 'שם היזם', label: 'יזם' },
  { key: "מס' תכנית/ מס זמני", label: 'מס׳ תכנית' },
  { key: 'סטטוס רמזור', label: 'סטטוס' },
  { key: '__follow', label: 'גורם מעקב' },
  { key: '__count', label: 'חוו״ד' },
  { key: '__profit', label: 'רווחיות אחרונה' },
  { key: '__review', label: 'בקרת שומה' }
];
const INLINE_KEYS = ['רובע', 'שם התכנית', 'שם היזם', "מס' תכנית/ מס זמני", 'סטטוס רמזור'];

function profitBand(v) {
  if (v === null) return 'ללא נתוני רווחיות';
  if (v <= PROFIT_THRESHOLD - 5) return `עד ${PROFIT_THRESHOLD - 5}%`;
  if (v <= PROFIT_THRESHOLD) return `${PROFIT_THRESHOLD - 5}%–${PROFIT_THRESHOLD}% (עד הבנצ'מרק)`;
  if (v <= PROFIT_THRESHOLD + 5) return `${PROFIT_THRESHOLD}%–${PROFIT_THRESHOLD + 5}% (מעל הבנצ'מרק)`;
  return `מעל ${PROFIT_THRESHOLD + 5}%`;
}

const GROUPS = [
  { value: '', label: 'ללא קיבוץ' },
  { value: 'רובע', label: 'רובע', fn: (r) => r.p['רובע'] },
  { value: 'שם היזם', label: 'יזם', fn: (r) => r.p['שם היזם'] },
  { value: 'שם התכנית', label: 'שם הפרויקט', fn: (r) => r.p['שם התכנית'] },
  { value: 'כתובת הפרויקט', label: 'כתובת', fn: (r) => r.p['כתובת הפרויקט'] },
  { value: "מס' תכנית/ מס זמני", label: 'סוג / מס׳ תכנית', fn: (r) => (/מחוזית/.test(r.p["מס' תכנית/ מס זמני"]) ? 'מחוזית' : /תמ["״]?ל/.test(r.p["מס' תכנית/ מס זמני"]) ? 'ותמ״ל' : r.p["מס' תכנית/ מס זמני"] ? 'מקומית / אחר' : 'ללא מס׳') },
  { value: 'סטטוס רמזור', label: 'סטטוס', fn: (r) => r.p['סטטוס רמזור'] },
  { value: '__follow', label: 'גורם מעקב', fn: (r) => (r.follow ? `ממתין ל${r.follow.who}` : 'אין בקשה פתוחה') },
  { value: '__profit', label: 'רווחיות ביחס לבנצ׳מרק', fn: (r) => profitBand(r.dev) },
  { value: '__cityAppraiser', label: 'שמאי עירייה', fn: (r) => latestOpinion(r.e)?.['שמאי מטעם העירייה'] },
  { value: '__devAppraiser', label: 'שמאי יזם', fn: (r) => latestWith(r.e, 'שמאי מטעם היזם')?.['שמאי מטעם היזם'] },
  { value: '__year', label: 'שנת בקשה אחרונה', fn: (r) => { const d = parseDate(latestOpinion(r.e)?.['תאריך קבלת בקשה']); return d ? String(d.getFullYear()) : null; } },
  { value: '__count', label: 'מספר חוות דעת', fn: (r) => `${r.e.opinions.length} חוו״ד` },
  { value: '__review', label: 'סטטוס בקרת שומה', fn: (r) => (r.review ? REVIEW_STATUS[r.review.status]?.label : 'טרם נפתחה בקרה') }
];

const CHIPS = [
  { id: 'city', label: 'ממתין לעירייה', test: (r) => r.follow && SIDE(r.follow.who) === 'city' },
  { id: 'dev', label: 'ממתין ליזם / שמאי היזם', test: (r) => r.follow && SIDE(r.follow.who) === 'dev' },
  { id: 'above', label: 'מעל הבנצ׳מרק', test: (r) => r.dev !== null && r.dev > PROFIT_THRESHOLD },
  { id: 'none', label: 'ללא רווחיות', test: (r) => r.dev === null },
  { id: 'review', label: 'שומות בבדיקה', test: (r) => r.review && r.review.status !== 'approved' }
];

export function SortHeader({ label, col, sort, onSort }) {
  const active = sort.col === col;
  return (
    <th aria-sort={active ? (sort.asc ? 'ascending' : 'descending') : 'none'} className={active ? 'th-sorted' : ''}>
      <button className={`th-btn${active ? ' sorted' : ''}`} onClick={() => onSort(col)} title="לחיצה ממיינת לפי עמודה זו">
        <span>{label}</span>
        <span className="sort-mark" aria-hidden="true">{active ? (sort.asc ? '▲' : '▼') : '⇅'}</span>
      </button>
    </th>
  );
}

export function ProfitPair({ dev, city, compact }) {
  const gap = dev !== null && city !== null ? dev - city : null;
  return (
    <span className={`pair${compact ? ' pair-compact' : ''}`}>
      <span className="pair-item"><span className="pair-role">יזם</span><b style={{ color: profitColor(dev) }}>{dev !== null ? dev.toFixed(1) + '%' : '—'}</b></span>
      <span className="pair-item"><span className="pair-role">עירייה</span><b style={{ color: profitColor(city) }}>{city !== null ? city.toFixed(1) + '%' : '—'}</b></span>
      {gap !== null && <span className="pair-item"><span className="pair-role">פער</span><b dir="ltr" style={{ color: gapColor(gap) }}>{(gap > 0 ? '+' : '') + gap.toFixed(1)}</b></span>}
      <span className="pair-track" aria-hidden="true">
        <span className="pair-mark" />
        {dev !== null && <motion.span className="pair-fill" style={{ background: profitColor(dev) }} initial={{ width: 0 }} animate={{ width: Math.min(100, (dev / 30) * 100) + '%' }} transition={{ duration: 0.8, ease }} />}
      </span>
    </span>
  );
}

export function FollowBadge({ follow }) {
  if (!follow) return <span className="muted">—</span>;
  return (
    <span className={`follow follow-${SIDE(follow.who)}`}>
      <b>{follow.who}</b>
      {follow.name && <span className="follow-name">{follow.name}</span>}
      <span className="follow-time mono">{formatDuration(follow.days)}</span>
    </span>
  );
}

export default function ProjectsView({ ctx }) {
  const projects = ctx.data.projects;
  const notes = ctx.data.notes || [];
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [chips, setChips] = useState([]);
  const [sort, setSort] = useState({ col: null, asc: true });
  const [groupBy, setGroupBy] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [adding, setAdding] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { const t = setTimeout(() => setQ(query.trim()), 200); return () => clearTimeout(t); }, [query]);

  const stats = useMemo(() => overview(projects), [projects]);

  const reviews = ctx.data.reviews || [];
  const allRows = useMemo(() => projects.map((e) => ({
    e, p: e.project, dev: latestDev(e), city: latestCity(e), follow: followUp(e), review: reviewOf(reviews, e.project._id)
  })), [projects, reviews]);

  const rows = useMemo(() => {
    let list = allRows;
    if (q) list = list.filter((r) => matchKeywords(r.e, q, notes.filter((n) => n.project_id === r.p._id)));
    chips.forEach((id) => { const c = CHIPS.find((x) => x.id === id); list = list.filter(c.test); });
    if (sort.col) {
      const dir = sort.asc ? 1 : -1;
      list = list.slice().sort((a, b) => {
        let va, vb;
        if (sort.col === '__count') { va = a.e.opinions.length; vb = b.e.opinions.length; }
        else if (sort.col === '__profit') { va = a.dev ?? -999; vb = b.dev ?? -999; }
        else if (sort.col === '__follow') { va = a.follow ? a.follow.days : -1; vb = b.follow ? b.follow.days : -1; }
        else if (sort.col === '__review') { va = a.review ? Object.keys(REVIEW_STATUS).indexOf(a.review.status) : -1; vb = b.review ? Object.keys(REVIEW_STATUS).indexOf(b.review.status) : -1; }
        else { va = a.p[sort.col] || ''; vb = b.p[sort.col] || ''; }
        if (typeof va === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), 'he') * dir;
      });
    }
    return list;
  }, [allRows, q, chips, sort, notes]);

  const groups = useMemo(() => {
    const g = GROUPS.find((x) => x.value === groupBy);
    if (!g || !g.fn) return [{ label: null, rows }];
    const map = new Map();
    rows.forEach((r) => {
      const k = (g.fn(r) || '').toString().trim() || 'ללא';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'he', { numeric: true }))
      .map(([label, rs]) => ({ label, rows: rs }));
  }, [rows, groupBy]);

  function toggleSort(col) {
    setSort((s) => (s.col === col ? (s.asc ? { col, asc: false } : { col: null, asc: true }) : { col, asc: true }));
  }

  function startEdit(e) {
    setEditing(e.project._id);
    setDraft({ ...e.project });
    setExpanded(null);
  }

  async function saveEdit() {
    const res = await ctx.mutate((k) => api.saveProject(k, editing, draft), 'הפרויקט עודכן');
    if (res !== null) setEditing(null);
  }

  async function remove(e) {
    const ok = await ctx.confirm(`להעביר את "${projectName(e.project)}" לסל המחזור? אפשר לשחזר אותו בכל עת.`, 'העבר לסל');
    if (!ok) return;
    const id = e.project._id;
    const res = await ctx.mutate((k) => api.removeProject(k, id));
    if (res !== null) {
      ctx.toast('הפרויקט הועבר לסל', 'ok', {
        label: 'בטל',
        onClick: () => ctx.mutate((k) => api.restoreProject(k, id), 'הפרויקט שוחזר')
      });
    }
  }

  async function onImport(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    let list;
    try { list = await parseExcel(file); } catch { ctx.toast('לא ניתן לקרוא את הקובץ', 'error'); return; }
    if (!list.length) { ctx.toast('לא נמצאו שורות בקובץ', 'error'); return; }
    const ops = list.reduce((n, e) => n + e.opinions.length, 0);
    const ok = await ctx.confirm(`נמצאו ${list.length} פרויקטים ו־${ops} חוות דעת. הייבוא יחליף את המאגר הנוכחי. הפרויקטים הקיימים יעברו לסל המחזור ויישארו ניתנים לשחזור.`, 'ייבא והחלף');
    if (!ok) return;
    await ctx.mutate((k) => api.replaceAll(k, list), `יובאו ${list.length} פרויקטים`);
  }

  async function onExport() {
    try { await exportExcel(projects); ctx.toast('קובץ Excel ירד למחשב', 'ok'); }
    catch { ctx.toast('הייצוא נכשל', 'error'); }
  }

  const sortedLabel = sort.col ? `${COLS.find((c) => c.key === sort.col)?.label}, ${sort.asc ? 'מהקטן לגדול' : 'מהגדול לקטן'}` : null;

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <span className="label">מאגר פרויקטים</span>
          <h1 className="display-l">פינוי־בינוי<br /><span className="thin">וחוות דעת שמאיות</span></h1>
        </div>
        <Overview stats={stats} />
      </section>

      {stats.open.length > 0 && <Waiting open={stats.open} ctx={ctx} />}

      <section className="panel">
        <div className="toolbar">
          <div className="search">
            <input
              className="input"
              type="search"
              placeholder="חיפוש לפי מילות מפתח: יזם, שמאי, רחוב, מס׳ תכנית, מילה מההערות…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="חיפוש"
            />
          </div>
          <label className="inline-field">
            <span className="label">קיבוץ לפי</span>
            <select className="input select" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} aria-label="קיבוץ">
              {GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </label>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={() => setAdding(true)}>פרויקט חדש</button>
          <button className="btn btn-ghost" onClick={onExport}>ייצוא Excel</button>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>ייבוא Excel</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={onImport} data-testid="import-file" />
        </div>

        <div className="chips" role="group" aria-label="סינון מהיר">
          {CHIPS.map((c) => {
            const on = chips.includes(c.id);
            const n = allRows.filter(c.test).length;
            return (
              <button key={c.id} className={`chip-btn${on ? ' on' : ''}`} aria-pressed={on}
                onClick={() => setChips(on ? chips.filter((x) => x !== c.id) : [...chips, c.id])}>
                {c.label} <span className="mono">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="table-head-line">
          <span className="label">
            {q || chips.length ? `${rows.length} תוצאות מתוך ${projects.length}` : `${projects.length} פרויקטים`}
            {sortedLabel && <> · ממוין לפי {sortedLabel} <button className="link-btn" onClick={() => setSort({ col: null, asc: true })}>ניקוי מיון</button></>}
          </span>
          <BenchmarkLegend compact />
        </div>

        <div className="table-wrap">
          <table className="table table-projects" data-sorted={sort.col || ''}>
            <thead>
              <tr>
                <th className="col-num">#</th>
                {COLS.map((c) => <SortHeader key={c.key} label={c.label} col={c.key} sort={sort} onSort={toggleSort} />)}
                <th className="col-actions"><span className="sr-only">פעולות</span></th>
              </tr>
            </thead>
            {groups.map((g, gi) => (
              <tbody key={g.label ?? 'all'}>
                {g.label !== null && (
                  <tr className="group-row">
                    <td colSpan={COLS.length + 2}>
                      <span className="group-label">{g.label}</span>
                      <span className="label">{g.rows.length} פרויקטים</span>
                    </td>
                  </tr>
                )}
                {g.rows.map((r, i) => {
                  const { e, p } = r;
                  const id = p._id;
                  const isEdit = editing === id;
                  const isOpen = expanded === id;
                  const sc = (k) => (sort.col === k ? 'td-sorted' : '');
                  return (
                    <React.Fragment key={id}>
                      <motion.tr
                        className={`row${isOpen ? ' row-open' : ''}${isEdit ? ' row-edit' : ''}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: Math.min(i, 20) * 0.015 + gi * 0.03 }}
                        onClick={(ev) => { if (!isEdit && !ev.target.closest('button,a,input,select')) setExpanded(isOpen ? null : id); }}
                      >
                        <td className="col-num" data-label="#"><span className="num">{String(i + 1).padStart(2, '0')}</span></td>
                        {isEdit ? INLINE_KEYS.map((k) => (
                          <td key={k} data-label={PROJECT_FIELDS.find((f) => f.key === k).short}>
                            {k === 'סטטוס רמזור' ? (
                              <select className="input input-cell" value={draft[k] || ''} onChange={(ev) => setDraft({ ...draft, [k]: ev.target.value })}>
                                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            ) : (
                              <input className="input input-cell" value={draft[k] || ''} aria-label={k} onChange={(ev) => setDraft({ ...draft, [k]: ev.target.value })} />
                            )}
                          </td>
                        )) : (
                          <>
                            <td data-label="רובע" className={sc('רובע')}><span className="quarter">{p['רובע'] || '—'}</span></td>
                            <td data-label="פרויקט" className={sc('שם התכנית')}>
                              <span className="project-name">{projectName(p)}</span>
                              {p['שם התכנית'] && p['כתובת הפרויקט'] && <span className="project-sub">{p['כתובת הפרויקט']}</span>}
                            </td>
                            <td data-label="יזם" className={sc('שם היזם')}>{p['שם היזם'] || '—'}</td>
                            <td data-label="מס׳ תכנית" className={`mono ${sc("מס' תכנית/ מס זמני")}`}>{p["מס' תכנית/ מס זמני"] || '—'}</td>
                            <td data-label="סטטוס" className={sc('סטטוס רמזור')}><StatusPill value={p['סטטוס רמזור']} /></td>
                          </>
                        )}
                        <td data-label="גורם מעקב" className={sc('__follow')}><FollowBadge follow={r.follow} /></td>
                        <td data-label="חוו״ד" className={`mono ${sc('__count')}`}>{e.opinions.length}</td>
                        <td data-label="רווחיות" className={sc('__profit')}><ProfitPair dev={r.dev} city={r.city} /></td>
                        <td data-label="בקרת שומה" className={sc('__review')}><ReviewPill review={r.review} /></td>
                        <td className="col-actions">
                          {isEdit ? (
                            <div className="row-actions">
                              <button className="btn btn-sm btn-primary" onClick={saveEdit}>שמור</button>
                              <button className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>ביטול</button>
                            </div>
                          ) : (
                            <div className="row-actions">
                              <a className="btn btn-sm btn-ghost" href={`#/p/${id}`}>פתח</a>
                              <a className="btn btn-sm btn-ghost" href={`#/p/${id}/r`}>בקרת שומת השבחה</a>
                              <button className="btn btn-sm btn-ghost" onClick={() => startEdit(e)}>ערוך</button>
                              <button className="btn btn-sm btn-ghost btn-quiet" onClick={() => remove(e)}>מחק</button>
                            </div>
                          )}
                        </td>
                      </motion.tr>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <tr className="expand-row">
                            <td colSpan={COLS.length + 2}>
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.35, ease }}
                                className="expand-inner"
                              >
                                <OpinionStrip entry={e} />
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}
              </tbody>
            ))}
          </table>
          {rows.length === 0 && (
            <div className="empty">
              <p>{q || chips.length ? 'אין פרויקטים שתואמים את החיפוש.' : 'המאגר ריק. הוסיפו פרויקט ראשון או ייבאו קובץ Excel.'}</p>
            </div>
          )}
        </div>
      </section>

      <NewProjectModal open={adding} onClose={() => setAdding(false)} ctx={ctx} />
    </div>
  );
}

function Overview({ stats }) {
  const total = stats.projects || 1;
  const segs = [
    { k: 'בוצע', tone: 'green' }, { k: 'בטיפול', tone: 'amber' }, { k: 'הוגש', tone: 'red' }, { k: '', tone: 'none', label: 'ללא סטטוס' }
  ];
  const cityWait = stats.open.filter((o) => SIDE(o.who) === 'city').length;
  const tiles = [
    { label: 'פרויקטים', value: stats.projects },
    { label: 'חוות דעת', value: stats.opinions },
    { label: `ממוצע רווחיות יזם · ${stats.devCount} חוו״ד עם נתון · בנצ'מרק ${PROFIT_THRESHOLD}%`, value: stats.avgDev !== null ? stats.avgDev.toFixed(1) + '%' : '—', color: profitColor(stats.avgDev) },
    { label: 'ממתינים לעירייה / ליזם', value: `${cityWait} / ${stats.open.length - cityWait}` },
    { label: 'זמן טיפול חציוני', value: stats.medianTurn !== null ? formatDuration(stats.medianTurn) : '—', small: true }
  ];
  return (
    <div className="overview">
      <div className="tiles">
        {tiles.map((t, i) => (
          <motion.div
            key={t.label}
            className="tile"
            initial={{ opacity: 0, y: 18, rotateX: 10 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.6, delay: 0.08 * i, ease }}
          >
            <span className="label">{t.label}</span>
            <span className={`tile-value${t.small ? ' tile-value-s' : ''}`} style={t.color ? { color: t.color } : undefined}>{t.value}</span>
          </motion.div>
        ))}
      </div>
      <div className="statusbar" aria-label="התפלגות סטטוס">
        <div className="statusbar-track">
          {segs.map((s, i) => stats.status[s.k] > 0 && (
            <motion.span
              key={s.tone}
              className={`seg seg-${s.tone}`}
              initial={{ width: 0 }}
              animate={{ width: (stats.status[s.k] / total) * 100 + '%' }}
              transition={{ duration: 0.9, delay: 0.3 + i * 0.08, ease }}
              title={`${s.label || s.k}: ${stats.status[s.k]}`}
            />
          ))}
        </div>
        <div className="statusbar-legend">
          {segs.map((s) => (
            <span key={s.tone} className="legend-item">
              <i className={`dot dot-${s.tone}`} />{s.label || s.k} <b className="mono">{stats.status[s.k]}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Waiting({ open, ctx }) {
  const [all, setAll] = useState(false);
  const [side, setSide] = useState('all');
  const filtered = side === 'all' ? open : open.filter((o) => SIDE(o.who) === side);
  const list = all ? filtered : filtered.slice(0, 4);
  const settings = ctx.data.settings || {};
  const byId = new Map(ctx.data.projects.map((e) => [e.project._id, e.project]));
  return (
    <section className="panel panel-waiting">
      <div className="panel-head">
        <div>
          <span className="label">דורש מעקב</span>
          <h2 className="display-s">בקשות שטרם התקבלה עליהן חוות דעת</h2>
        </div>
        <div className="seg-control" role="radiogroup" aria-label="סינון לפי גורם">
          {[['all', `הכול ${open.length}`], ['city', `עירייה ${open.filter((o) => SIDE(o.who) === 'city').length}`], ['dev', `יזם ${open.filter((o) => SIDE(o.who) === 'dev').length}`]].map(([v, l]) => (
            <button key={v} role="radio" aria-checked={side === v} className={side === v ? 'on' : ''} onClick={() => setSide(v)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="waiting-grid">
        {list.map((o, i) => (
          <motion.div
            key={o.projectId}
            className={`waiting-card waiting-${SIDE(o.who)}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4, ease }}
          >
            <span className="waiting-who">
              ממתין ל<b>{o.who}</b>{o.inferred && <span className="muted" title="לא הוגדר במפורש, הוסק מההערות"> · משוער</span>}
            </span>
            <span className="waiting-name">{o.name || 'לא צוין שם'}</span>
            <span className="waiting-days">{formatDuration(o.waiting)}</span>
            <a className="project-name waiting-project" href={`#/p/${o.projectId}`}>{o.plan || o.address || o.developer}</a>
            <span className="muted">יזם: {o.developer}</span>
            <div className="waiting-actions">
              <button className="btn btn-sm btn-primary" onClick={() => ctx.openMail(reminderRequest(byId.get(o.projectId), o, settings))}>
                מייל תזכורת ל{o.who}
              </button>
              <a className="btn btn-sm btn-ghost" href={`#/p/${o.projectId}`}>לכרטיס</a>
            </div>
          </motion.div>
        ))}
      </div>
      {filtered.length > 4 && (
        <button className="link-btn" onClick={() => setAll(!all)}>{all ? 'הצג פחות' : `הצג את כל ${filtered.length}`}</button>
      )}
    </section>
  );
}

function OpinionStrip({ entry }) {
  const ops = entry.opinions;
  return (
    <div className="strip">
      {ops.length === 0 && <p className="muted">אין עדיין חוות דעת לפרויקט זה.</p>}
      {ops.length > 0 && (
        <p className="strip-key">
          <span className="label">מקרא</span> כל נקודה היא חוות דעת, מהראשונה (למעלה) לאחרונה. צבע הנקודה: רווחיות היזם ביחס לבנצ'מרק,
          <i className="key-dot" style={{ borderColor: profitColor(10) }} /> ירוק מתחת ל־15%,
          <i className="key-dot" style={{ borderColor: profitColor(20) }} /> אדום מעל,
          <i className="key-dot" style={{ borderColor: 'var(--ink-4)' }} /> אפור ללא נתון.
        </p>
      )}
      <ol className="timeline">
        {ops.map((o, i) => {
          const dev = parsePercent(o['רווחיות יזם (%)']);
          const city = parsePercent(o['רווחיות עירייה (%)']);
          return (
            <li key={o._id} className="timeline-item">
              <span className="timeline-dot" style={{ borderColor: profitColor(dev) }} />
              <span className="label">חוו״ד {i + 1} · בקשה {o['תאריך קבלת בקשה'] || '—'} · חוו״ד {o['תאריך קבלת חוו"ד'] || 'טרם התקבלה'}</span>
              <span className="timeline-main">
                <span className="role">שמאי יזם:</span> {o['שמאי מטעם היזם'] || '—'}
                <span className="sep" />
                <span className="role">שמאי עירייה:</span> {o['שמאי מטעם העירייה'] || '—'}
              </span>
              <ProfitPair dev={dev} city={city} compact />
              {o['הערות / סטטוס'] && <span className="timeline-note">{o['הערות / סטטוס']}</span>}
            </li>
          );
        })}
      </ol>
      <a className="btn btn-sm btn-primary" href={`#/p/${entry.project._id}`}>לכרטיס הפרויקט המלא</a>
    </div>
  );
}

function NewProjectModal({ open, onClose, ctx }) {
  const [form, setForm] = useState({});
  useEffect(() => { if (open) setForm({}); }, [open]);
  async function save() {
    if (!(form['שם היזם'] || '').trim() && !(form['כתובת הפרויקט'] || '').trim()) {
      ctx.toast('יש למלא לפחות שם יזם או כתובת', 'error');
      return;
    }
    const id = await ctx.mutate((k) => api.saveProject(k, null, form), 'הפרויקט נוסף');
    if (id) { onClose(); window.location.hash = `#/p/${id}`; }
  }
  return (
    <Modal
      open={open}
      title="פרויקט חדש"
      onClose={onClose}
      wide
      actions={
        <>
          <button className="btn btn-primary" onClick={save}>שמור פרויקט</button>
          <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
        </>
      }
    >
      <div className="form-grid">
        {PROJECT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.type === 'status' ? (
              <select className="input" value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                className="input"
                dir={f.type === 'url' ? 'ltr' : undefined}
                type={f.type === 'url' ? 'url' : 'text'}
                value={form[f.key] || ''}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            )}
          </Field>
        ))}
      </div>
    </Modal>
  );
}

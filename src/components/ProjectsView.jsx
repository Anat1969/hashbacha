import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../lib/api.js';
import { PROJECT_FIELDS, STATUS_OPTIONS } from '../lib/fields.js';
import { avgDevProfit, calcGap, overview } from '../lib/calc.js';
import { exportExcel, parseExcel } from '../lib/excel.js';
import { Field, Modal, ProfitMeter, StatusPill, ease } from './ui.jsx';
import { PROFIT_THRESHOLD } from '../lib/config.js';

const COLS = [
  { key: 'רובע', label: 'רובע' },
  { key: 'שם היזם', label: 'שם היזם' },
  { key: 'כתובת הפרויקט', label: 'כתובת' },
  { key: "מס' תכנית/ מס זמני", label: 'מס׳ תכנית' },
  { key: 'שם התכנית', label: 'שם התכנית' },
  { key: 'סטטוס רמזור', label: 'סטטוס' },
  { key: '__count', label: 'חוו״ד' },
  { key: '__avg', label: 'רווחיות יזם ממוצעת' }
];
const INLINE_KEYS = ['רובע', 'שם היזם', 'כתובת הפרויקט', "מס' תכנית/ מס זמני", 'שם התכנית', 'סטטוס רמזור'];

function profitBand(v) {
  if (v === null) return 'ללא נתוני רווחיות';
  if (v < 10) return 'עד 10%';
  if (v < 15) return '10%–15%';
  if (v < 20) return '15%–20%';
  return '20% ומעלה';
}

export default function ProjectsView({ ctx }) {
  const projects = ctx.data.projects;
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ col: null, asc: true });
  const [groupBy, setGroupBy] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [adding, setAdding] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { const t = setTimeout(() => setQ(query.trim().toLowerCase()), 200); return () => clearTimeout(t); }, [query]);

  const stats = useMemo(() => overview(projects), [projects]);

  const rows = useMemo(() => {
    let list = projects.map((e) => ({ e, avg: avgDevProfit(e) }));
    if (q) {
      list = list.filter(({ e }) =>
        Object.values(e.project).some((v) => String(v).toLowerCase().includes(q)) ||
        e.opinions.some((o) => Object.values(o).some((v) => String(v).toLowerCase().includes(q))));
    }
    if (sort.col) {
      const dir = sort.asc ? 1 : -1;
      list = list.slice().sort((a, b) => {
        let va, vb;
        if (sort.col === '__count') { va = a.e.opinions.length; vb = b.e.opinions.length; }
        else if (sort.col === '__avg') { va = a.avg ?? -999; vb = b.avg ?? -999; }
        else { va = a.e.project[sort.col] || ''; vb = b.e.project[sort.col] || ''; }
        if (typeof va === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), 'he') * dir;
      });
    }
    return list;
  }, [projects, q, sort]);

  const groups = useMemo(() => {
    if (!groupBy) return [{ label: null, rows }];
    const map = new Map();
    rows.forEach((r) => {
      const k = groupBy === '__avg' ? profitBand(r.avg) : (r.e.project[groupBy] || 'ללא');
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return [...map.entries()].map(([label, rs]) => ({ label, rows: rs }));
  }, [rows, groupBy]);

  function toggleSort(col) {
    setSort((s) => (s.col === col ? { col, asc: !s.asc } : { col, asc: true }));
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
    const ok = await ctx.confirm(`להעביר את הפרויקט "${e.project['שם היזם'] || ''}" לסל המחזור? אפשר לשחזר אותו בכל עת.`, 'העבר לסל');
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

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <span className="label">מאגר פרויקטים</span>
          <h1 className="display-l">פינוי־בינוי<br /><span className="thin">וחוות דעת שמאיות</span></h1>
        </div>
        <Overview stats={stats} />
      </section>

      {stats.open.length > 0 && <Waiting open={stats.open} />}

      <section className="panel">
        <div className="toolbar">
          <div className="search">
            <input
              className="input"
              type="search"
              placeholder="חיפוש חופשי: יזם, שמאי, כתובת, מס׳ תכנית…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="חיפוש"
            />
          </div>
          <select className="input select" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} aria-label="קיבוץ">
            <option value="">ללא קיבוץ</option>
            <option value="רובע">קיבוץ לפי רובע</option>
            <option value="__avg">קיבוץ לפי רווחיות</option>
            <option value="סטטוס רמזור">קיבוץ לפי סטטוס</option>
          </select>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={() => setAdding(true)}>פרויקט חדש</button>
          <button className="btn btn-ghost" onClick={onExport}>ייצוא Excel</button>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>ייבוא Excel</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={onImport} data-testid="import-file" />
        </div>

        <div className="result-line label">
          {q ? `${rows.length} תוצאות מתוך ${projects.length}` : `${projects.length} פרויקטים`}
          {sort.col && <button className="link-btn" onClick={() => setSort({ col: null, asc: true })}>ניקוי מיון</button>}
        </div>

        <div className="table-wrap">
          <table className="table table-projects">
            <thead>
              <tr>
                <th className="col-num">#</th>
                {COLS.map((c) => (
                  <th key={c.key} aria-sort={sort.col === c.key ? (sort.asc ? 'ascending' : 'descending') : 'none'}>
                    <button className={`th-btn${sort.col === c.key ? ' sorted' : ''}`} onClick={() => toggleSort(c.key)}>
                      {c.label}
                      <span className="sort-mark">{sort.col === c.key ? (sort.asc ? '↑' : '↓') : ''}</span>
                    </button>
                  </th>
                ))}
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
                {g.rows.map(({ e, avg }, i) => {
                  const p = e.project;
                  const id = p._id;
                  const isEdit = editing === id;
                  const isOpen = expanded === id;
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
                            <td data-label="רובע"><span className="quarter">{p['רובע'] || '—'}</span></td>
                            <td data-label="יזם" className="strong">{p['שם היזם'] || '—'}</td>
                            <td data-label="כתובת">{p['כתובת הפרויקט'] || '—'}</td>
                            <td data-label="מס׳ תכנית" className="mono">{p["מס' תכנית/ מס זמני"] || '—'}</td>
                            <td data-label="תכנית">{p['שם התכנית'] || '—'}</td>
                            <td data-label="סטטוס"><StatusPill value={p['סטטוס רמזור']} /></td>
                          </>
                        )}
                        <td data-label="חוו״ד" className="mono">{e.opinions.length}</td>
                        <td data-label="רווחיות"><ProfitMeter value={avg} /></td>
                        <td className="col-actions">
                          {isEdit ? (
                            <div className="row-actions">
                              <button className="btn btn-sm btn-primary" onClick={saveEdit}>שמור</button>
                              <button className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>ביטול</button>
                            </div>
                          ) : (
                            <div className="row-actions">
                              <a className="btn btn-sm btn-ghost" href={`#/p/${id}`}>פתח</a>
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
              <p>{q ? 'אין פרויקטים שתואמים את החיפוש.' : 'המאגר ריק. הוסיפו פרויקט ראשון או ייבאו קובץ Excel.'}</p>
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
  const tiles = [
    { label: 'פרויקטים', value: stats.projects },
    { label: 'חוות דעת', value: stats.opinions },
    { label: 'רווחיות יזם ממוצעת', value: stats.avgDev !== null ? stats.avgDev.toFixed(1) + '%' : '—' },
    { label: `מעל סף ${PROFIT_THRESHOLD}%`, value: stats.abovePct !== null ? Math.round(stats.abovePct) + '%' : '—' },
    { label: 'זמן טיפול חציוני', value: stats.medianTurn !== null ? `${stats.medianTurn} ימים` : '—' }
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
            <span className="tile-value">{t.value}</span>
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

function Waiting({ open }) {
  const [all, setAll] = useState(false);
  const list = all ? open : open.slice(0, 4);
  return (
    <section className="panel panel-waiting">
      <div className="panel-head">
        <div>
          <span className="label">דורש מעקב</span>
          <h2 className="display-s">בקשות שטרם התקבלה עליהן חוו״ד</h2>
        </div>
        <span className="count-badge mono">{open.length}</span>
      </div>
      <div className="waiting-grid">
        {list.map((o, i) => (
          <motion.a
            key={o.opinionId}
            href={`#/p/${o.projectId}`}
            className="waiting-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4, ease }}
          >
            <span className="waiting-days"><b>{o.waiting}</b> ימים</span>
            <span className="strong">{o.developer}</span>
            <span className="muted">{o.address}</span>
            <span className="label">{o.cityAppraiser || 'שמאי עירייה לא שובץ'}</span>
          </motion.a>
        ))}
      </div>
      {open.length > 4 && (
        <button className="link-btn" onClick={() => setAll(!all)}>{all ? 'הצג פחות' : `הצג את כל ${open.length}`}</button>
      )}
    </section>
  );
}

function OpinionStrip({ entry }) {
  const ops = entry.opinions;
  return (
    <div className="strip">
      {ops.length === 0 && <p className="muted">אין עדיין חוות דעת לפרויקט זה.</p>}
      <ol className="timeline">
        {ops.map((o, i) => {
          const gap = calcGap(o['רווחיות יזם (%)'], o['רווחיות עירייה (%)']);
          return (
            <li key={o._id} className="timeline-item">
              <span className="timeline-dot" />
              <span className="label">חוו״ד {i + 1} · {o['תאריך קבלת חוו"ד'] || o['תאריך קבלת בקשה'] || 'ללא תאריך'}</span>
              <span className="timeline-main">
                {o['שמאי מטעם היזם'] || '—'} <span className="muted">מול</span> {o['שמאי מטעם העירייה'] || '—'}
              </span>
              <span className="timeline-meta mono">
                {o['רווחיות יזם (%)'] || '—'}
                {gap.text && <span className={`gap gap-${gap.tone}`}> · פער {gap.text}</span>}
              </span>
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

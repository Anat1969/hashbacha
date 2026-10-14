import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../lib/api.js';
import { OPINION_FIELDS, OPINION_GROUPS, PROJECT_FIELDS, STATUS_OPTIONS } from '../lib/fields.js';
import { avgDevProfit, calcGap, isRange, parsePercent, profitColor, stampNotes } from '../lib/calc.js';
import { mailtoHref, newProjectMail, opinionReadyMail } from '../lib/mail.js';
import { PROFIT_THRESHOLD } from '../lib/config.js';
import { StatusPill, ease } from './ui.jsx';

const FIELD_BY_KEY = Object.fromEntries(OPINION_FIELDS.map((f) => [f.key, f]));
const ORDERED = OPINION_GROUPS.flatMap((g) => g.keys);

export default function ProjectDetail({ ctx, entry }) {
  const p = entry.project;
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(p);
  const [editingOp, setEditingOp] = useState(null); // opinion id | '__new__'
  const [opDraft, setOpDraft] = useState({});

  useEffect(() => { if (!editMode) setDraft(p); }, [p, editMode]);

  const dirty = useMemo(() => PROJECT_FIELDS.filter((f) => (draft[f.key] || '') !== (p[f.key] || '')).length, [draft, p]);
  const avg = avgDevProfit(entry);
  const settings = ctx.data.settings || {};

  async function saveProject() {
    const res = await ctx.mutate((k) => api.saveProject(k, p._id, draft), 'הפרויקט עודכן');
    if (res !== null) setEditMode(false);
  }

  async function removeProject() {
    const ok = await ctx.confirm(`להעביר את "${p['שם היזם'] || 'הפרויקט'}" לסל המחזור? אפשר לשחזר בכל עת.`, 'העבר לסל');
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

  return (
    <div className="page page-detail">
      <a className="back" href="#/">חזרה לכל הפרויקטים</a>

      <section className="detail-hero">
        <div className="detail-title">
          <span className="label">רובע {p['רובע'] || '—'} · {p["מס' תכנית/ מס זמני"] || 'ללא מס׳ תכנית'}</span>
          <h1 className="display-l">{p['שם היזם'] || 'ללא שם יזם'}</h1>
          <p className="lead">{[p['שם התכנית'], p['כתובת הפרויקט']].filter(Boolean).join(' · ') || '—'}</p>
          <div className="detail-badges">
            <StatusPill value={p['סטטוס רמזור']} />
            {p['קישור'] && <a className="chip" href={p['קישור']} target="_blank" rel="noreferrer">קישור לתכנית</a>}
          </div>
        </div>
        <div className="detail-figures">
          <div className="figure">
            <span className="label">חוות דעת</span>
            <span className="figure-value">{entry.opinions.length}</span>
          </div>
          <div className="figure">
            <span className="label">רווחיות יזם ממוצעת</span>
            <span className="figure-value" style={{ color: avg !== null ? profitColor(avg) : undefined }}>
              {avg !== null ? avg.toFixed(1) + '%' : '—'}
            </span>
          </div>
          <Trend opinions={entry.opinions} />
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
            <a className="btn btn-ghost" href={mailtoHref(newProjectMail(p, settings.ilanitEmail))}
              onClick={() => ctx.toast('נפתחה טיוטת מייל לאילנית')}>מייל: פרויקט חדש</a>
            <a className="btn btn-ghost" href={mailtoHref(opinionReadyMail(p, settings.planningEmail))}
              onClick={() => ctx.toast('נפתחה טיוטת מייל לאגף תכנון')}>מייל: קיימת חוו״ד</a>
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
                <span className="fact-value">
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
            <span className="label">רצף בקשות וחוות דעת</span>
            <h2 className="display-s">חוות דעת</h2>
          </div>
          <div className="panel-actions">
            <button className="btn btn-primary" onClick={() => startOp(null)}>חוות דעת חדשה</button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table table-opinions">
            <thead>
              <tr className="group-head">
                <th rowSpan={2} className="col-num">#</th>
                {OPINION_GROUPS.map((g) => <th key={g.label} colSpan={g.keys.length}>{g.label}</th>)}
                <th rowSpan={2} className="col-actions"><span className="sr-only">פעולות</span></th>
              </tr>
              <tr>
                {ORDERED.map((k) => <th key={k}>{k === '__gap' ? 'פער' : FIELD_BY_KEY[k].label}</th>)}
              </tr>
            </thead>
            <tbody>
              {entry.opinions.map((o, i) => (
                editingOp === o._id
                  ? <OpinionEditRow key={o._id} n={i + 1} draft={opDraft} setDraft={setOpDraft} onSave={saveOp} onCancel={() => setEditingOp(null)} />
                  : <OpinionRow key={o._id} o={o} n={i + 1} onEdit={() => startOp(o)} onDelete={() => removeOp(o, i)} />
              ))}
              {editingOp === '__new__' && (
                <OpinionEditRow n={entry.opinions.length + 1} draft={opDraft} setDraft={setOpDraft} onSave={saveOp} onCancel={() => setEditingOp(null)} isNew />
              )}
            </tbody>
          </table>
          {entry.opinions.length === 0 && editingOp !== '__new__' && (
            <div className="empty"><p>אין עדיין חוות דעת. הוסיפו את הבקשה הראשונה.</p></div>
          )}
        </div>
        <p className="hint">הוספת טקסט להערות מתויגת אוטומטית בתאריך היום. רווחיות בטווח (למשל 10%–16%) מחושבת לפי אמצע הטווח.</p>
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

function OpinionRow({ o, n, onEdit, onDelete }) {
  const gap = calcGap(o['רווחיות יזם (%)'], o['רווחיות עירייה (%)']);
  return (
    <tr className="row">
      <td className="col-num" data-label="#"><span className="num">{String(n).padStart(2, '0')}</span></td>
      {ORDERED.map((k) => {
        if (k === '__gap') return <td key={k} data-label="פער" className={`mono gap gap-${gap.tone}${gap.text ? '' : ' is-empty'}`}>{gap.text || '—'}</td>;
        const f = FIELD_BY_KEY[k];
        const v = o[k] || '';
        const empty = v.trim() ? '' : ' is-empty';
        if (f.type === 'pct') {
          const num = parsePercent(v);
          return (
            <td key={k} data-label={f.label} className={'mono' + empty}>
              {v ? <span style={{ color: num !== null ? profitColor(num) : undefined }}>{v}</span> : '—'}
              {isRange(v) && <span className="range-tag">טווח</span>}
            </td>
          );
        }
        if (f.type === 'textarea') return <td key={k} data-label={f.label} className={'notes' + empty}>{v || '—'}</td>;
        return <td key={k} data-label={f.label} className={(f.type === 'date' || f.type === 'num' ? 'mono' : '') + empty}>{v || '—'}</td>;
      })}
      <td className="col-actions">
        <div className="row-actions">
          <button className="btn btn-sm btn-ghost" onClick={onEdit}>ערוך</button>
          <button className="btn btn-sm btn-ghost btn-quiet" onClick={onDelete}>מחק</button>
        </div>
      </td>
    </tr>
  );
}

function OpinionEditRow({ n, draft, setDraft, onSave, onCancel, isNew }) {
  const gap = calcGap(draft['רווחיות יזם (%)'], draft['רווחיות עירייה (%)']);
  return (
    <tr className={`row row-edit${isNew ? ' row-new' : ''}`}>
      <td className="col-num" data-label="#"><span className="num">{String(n).padStart(2, '0')}</span></td>
      {ORDERED.map((k) => {
        if (k === '__gap') return <td key={k} data-label="פער" className={`mono gap gap-${gap.tone}`}>{gap.text || '—'}</td>;
        const f = FIELD_BY_KEY[k];
        return (
          <td key={k} data-label={f.label}>
            {f.type === 'textarea' ? (
              <textarea className="input input-cell" aria-label={f.label} rows={3} value={draft[k] || ''}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
            ) : (
              <input className="input input-cell" aria-label={f.label} placeholder={f.placeholder || ''}
                dir={f.type === 'date' || f.type === 'pct' || f.type === 'num' ? 'ltr' : undefined}
                value={draft[k] || ''} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
            )}
          </td>
        );
      })}
      <td className="col-actions">
        <div className="row-actions">
          <button className="btn btn-sm btn-primary" onClick={onSave}>שמור</button>
          <button className="btn btn-sm btn-ghost" onClick={onCancel}>ביטול</button>
        </div>
      </td>
    </tr>
  );
}

// Developer profitability across the opinion sequence, against the threshold line.
function Trend({ opinions }) {
  const pts = opinions.map((o) => parsePercent(o['רווחיות יזם (%)'])).filter((v) => v !== null);
  if (pts.length < 2) {
    return (
      <div className="figure figure-trend">
        <span className="label">מגמת רווחיות</span>
        <span className="muted">נדרשות שתי חוות דעת לפחות</span>
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
      <span className="label">מגמת רווחיות יזם</span>
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
        {pts.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" className="trend-dot" style={{ fill: profitColor(v) }} />)}
      </svg>
      <span className="label">קו מקווקו: סף {PROFIT_THRESHOLD}%</span>
    </div>
  );
}


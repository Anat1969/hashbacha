import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api.js';
import { NOTE_KINDS } from '../lib/fields.js';
import { ease } from './ui.jsx';
import { NoteComposer, NoteList } from './Notes.jsx';

const ACTION_LABEL = {
  project_add: 'נוסף פרויקט',
  project_edit: 'עודכן פרויקט',
  project_delete: 'פרויקט הועבר לסל',
  project_restore: 'פרויקט שוחזר',
  opinion_add: 'נוספה חוות דעת',
  opinion_edit: 'עודכנה חוות דעת',
  opinion_delete: 'נמחקה חוות דעת',
  note_add: 'נוספה הערה',
  import: 'ייבוא מ־Excel'
};

function when(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ActivityView({ ctx }) {
  const { activity = [], trash = [], notes = [] } = ctx.data;
  const [status, setStatus] = useState('open');
  const [kind, setKind] = useState('');
  const [scope, setScope] = useState('');

  const shown = notes.filter((n) =>
    (status === 'all' || (status === 'open' ? !n.done : n.done)) &&
    (!kind || n.kind === kind) &&
    (!scope || (scope === 'general' ? !n.project_id : !!n.project_id)));

  async function restore(t) {
    await ctx.mutate((k) => api.restoreProject(k, t._id), `"${t.name || 'הפרויקט'}" שוחזר`);
  }

  const openCount = notes.filter((n) => !n.done && n.kind !== 'note').length;

  return (
    <div className="page">
      <section className="hero hero-compact">
        <div className="hero-text">
          <span className="label">יומן אגף השבחה</span>
          <h1 className="display-l">מה לעשות, לבקש<br /><span className="thin">לזכור ולשמור בתיק</span></h1>
          <p className="lead">הערה כללית נשמרת ביומן. הערה שמתויקת לפרויקט מופיעה גם בתיק הפרויקט, בציר הזמן המלא שלו.</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="label">הערה חדשה</span>
            <h2 className="display-s">רישום ביומן</h2>
          </div>
          {openCount > 0 && <span className="count-badge mono" title="משימות פתוחות">{openCount}</span>}
        </div>
        <NoteComposer ctx={ctx} allowProjectPick />
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="label">{shown.length} רשומות</span>
            <h2 className="display-s">רשומות היומן</h2>
          </div>
          <div className="panel-actions filters">
            <div className="seg-control" role="radiogroup" aria-label="מצב">
              {[['open', 'פתוחות'], ['done', 'בוצעו'], ['all', 'הכול']].map(([v, l]) => (
                <button key={v} role="radio" aria-checked={status === v} className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>{l}</button>
              ))}
            </div>
            <select className="input select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="סוג">
              <option value="">כל הסוגים</option>
              {NOTE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <select className="input select" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="תיוק">
              <option value="">כללי ומתויק</option>
              <option value="general">כללי בלבד</option>
              <option value="filed">מתויק לפרויקט</option>
            </select>
          </div>
        </div>
        <NoteList ctx={ctx} notes={shown} showProject empty="אין רשומות שתואמות את הסינון." />
      </section>

      <div className="insight-grid">
        <section className="panel">
          <span className="label">30 הפעולות האחרונות במערכת</span>
          {activity.length === 0 && <p className="muted">אין עדיין פעולות.</p>}
          <ol className="log">
            {activity.map((a, i) => (
              <motion.li key={a.at + i} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02, duration: 0.3, ease }}>
                <span className="mono log-time">{when(a.at)}</span>
                <span>{ACTION_LABEL[a.action] || a.action}</span>
                <span className="strong">{a.summary || ''}</span>
              </motion.li>
            ))}
          </ol>
        </section>
        <section className="panel">
          <span className="label">סל מחזור · פרויקטים שנמחקו</span>
          {trash.length === 0 && <p className="muted">הסל ריק.</p>}
          <ul className="trash">
            {trash.map((t) => (
              <li key={t._id}>
                <span className="trash-text">
                  <span className="strong">{t.name || 'ללא שם'}</span>
                  <span className="muted">{t.address || ''}</span>
                  <span className="label">נמחק {when(t.deleted_at)}</span>
                </span>
                <button className="btn btn-sm btn-ghost" onClick={() => restore(t)}>שחזר</button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

import React from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api.js';
import { ease } from './ui.jsx';

const ACTION_LABEL = {
  project_add: 'נוסף פרויקט',
  project_edit: 'עודכן פרויקט',
  project_delete: 'פרויקט הועבר לסל',
  project_restore: 'פרויקט שוחזר',
  opinion_add: 'נוספה חוות דעת',
  opinion_edit: 'עודכנה חוות דעת',
  opinion_delete: 'נמחקה חוות דעת',
  import: 'ייבוא מ־Excel'
};

function when(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ActivityView({ ctx }) {
  const { activity = [], trash = [] } = ctx.data;

  async function restore(t) {
    await ctx.mutate((k) => api.restoreProject(k, t._id), `"${t.name || 'הפרויקט'}" שוחזר`);
  }

  return (
    <div className="page">
      <section className="hero hero-compact">
        <div className="hero-text">
          <span className="label">יומן וסל מחזור</span>
          <h1 className="display-l">מה השתנה<br /><span className="thin">ומה אפשר להחזיר</span></h1>
        </div>
      </section>
      <div className="insight-grid">
        <section className="panel">
          <span className="label">30 הפעולות האחרונות</span>
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

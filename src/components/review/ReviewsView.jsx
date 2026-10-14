import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../lib/api.js';
import { REVIEW_STATUS } from '../../lib/review/rules.js';
import { ease } from '../ui.jsx';
import { ReviewPill } from './ReviewPill.jsx';
import { readAuthor } from './ReviewTab.jsx';

const projectName = (p) => p['שם התכנית'] || p['כתובת הפרויקט'] || 'ללא שם';

const FILTERS = [
  { id: 'active', label: 'בקרות פתוחות', test: (r) => r.review && r.review.status !== 'approved' },
  { id: 'none', label: 'טרם נפתחה בקרה', test: (r) => !r.review },
  { id: 'approved', label: 'אושרו', test: (r) => r.review?.status === 'approved' },
  { id: 'all', label: 'הכול', test: () => true }
];

// Top-level "בקרת שומות": every opinion and its review, across all projects.
export default function ReviewsView({ ctx }) {
  const reviews = ctx.data.reviews || [];
  const [filter, setFilter] = useState(reviews.length ? 'active' : 'all');
  const [allOpinions, setAllOpinions] = useState(false);
  const canWrite = ctx.role !== 'viewer';

  const rows = useMemo(() => ctx.data.projects.flatMap((e) => {
    const ops = e.opinions.map((o, i) => ({ e, p: e.project, o, n: i + 1, review: reviews.find((r) => r.opinion_id === o._id) || null }));
    // By default: the latest opinion of each project, plus any opinion that already has a review.
    return allOpinions ? ops : ops.filter((x, i) => x.review || i === ops.length - 1);
  }), [ctx.data.projects, reviews, allOpinions]);

  const f = FILTERS.find((x) => x.id === filter) || FILTERS[3];
  const shown = rows.filter(f.test);
  const count = (s) => reviews.filter((r) => r.status === s).length;
  const tiles = [
    { label: 'בקרות פתוחות', value: reviews.filter((r) => r.status !== 'approved').length },
    { label: REVIEW_STATUS.waiting_for_reports.label, value: count('waiting_for_reports') },
    { label: 'בבדיקה · כולל דוח מתוקן', value: count('in_review') + count('reports_imported') + count('revised_report_received') },
    { label: REVIEW_STATUS.instructions_sent.label, value: count('instructions_sent') },
    { label: REVIEW_STATUS.approved.label, value: count('approved') }
  ];

  async function open(x) {
    const id = await ctx.mutate((k) => api.reviewOpen(k, x.p._id, x.o._id, readAuthor()), 'נפתחה בקרת שומה');
    if (id && id !== true) window.location.hash = `#/p/${x.p._id}/r/${id}`;
  }

  return (
    <div className="page">
      <section className="hero hero-compact">
        <div className="hero-text">
          <span className="label">בקרת שומות השבחה · פינוי בינוי</span>
          <h1 className="display-l">השוואת שומות<br /><span className="thin">יזם מול עירייה מול ייחוס</span></h1>
          <p className="lead">
            כל שומה נבדקת ב־22 פרמטרים מול עמודת ייחוס עם מקור. ירוק: קרוב יותר לייחוס או בטווח. אדום: רחוק יותר או חריגה.
            שורות שנדחו הופכות למכתב הוראות לשמאי היזם וליזם.
          </p>
        </div>
      </section>

      <div className="overview">
        <div className="tiles">
          {tiles.map((t, i) => (
            <motion.div key={t.label} className="tile" initial={{ opacity: 0, y: 18, rotateX: 10 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.6, delay: 0.08 * i, ease }}>
              <span className="label">{t.label}</span>
              <span className="tile-value">{t.value}</span>
            </motion.div>
          ))}
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="label">{shown.length} חוות דעת · לחיצה על "פתיחת ההשוואה" עוברת ללשונית "שומות השבחה" בכרטיס הפרויקט</span>
            <h2 className="display-s">בקרות לפי פרויקט</h2>
          </div>
        </div>
        <div className="chips" role="group" aria-label="סינון בקרות">
          {FILTERS.map((x) => (
            <button key={x.id} className={`chip-btn${filter === x.id ? ' on' : ''}`} aria-pressed={filter === x.id} onClick={() => setFilter(x.id)}>
              {x.label} <span className="mono">{rows.filter(x.test).length}</span>
            </button>
          ))}
          <label className="check">
            <input type="checkbox" checked={allOpinions} onChange={(e) => setAllOpinions(e.target.checked)} />
            להציג את כל חוות הדעת (לא רק האחרונה בכל פרויקט)
          </label>
        </div>
        <div className="table-wrap">
          <table className="table table-projects table-reviews">
            <thead>
              <tr>
                <th>פרויקט</th>
                <th>חוות דעת</th>
                <th>שמאים</th>
                <th>בקרת שומה</th>
                <th>התקדמות</th>
                <th className="col-actions"><span className="sr-only">פעולות</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((x, i) => (
                <motion.tr key={x.o._id} className="row" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(i, 20) * 0.015 }}>
                  <td data-label="פרויקט">
                    <span className="project-name">{projectName(x.p)}</span>
                    <span className="project-sub"><span className="role">יזם:</span> {x.p['שם היזם'] || '—'}</span>
                  </td>
                  <td data-label="חוות דעת"><span className="mono">{String(x.n).padStart(2, '0')}</span> · <span className="mono">{x.o['תאריך קבלת בקשה'] || 'ללא תאריך'}</span></td>
                  <td data-label="שמאים">
                    <span className="project-sub"><span className="role">שמאי יזם:</span> {x.o['שמאי מטעם היזם'] || '—'}</span>
                    <span className="project-sub"><span className="role">שמאי עירייה:</span> {x.o['שמאי מטעם העירייה'] || '—'}</span>
                  </td>
                  <td data-label="בקרת שומה"><ReviewPill review={x.review} empty="טרם נפתחה" /></td>
                  <td data-label="התקדמות">
                    {x.review ? (
                      <span className="review-progress">
                        <span className="ok-text">✓ <span className="mono">{x.review.ok}</span></span>
                        <span className="no-text">✗ <span className="mono">{x.review.no}</span></span>
                        <span className="muted">ממתינים <span className="mono">{22 - x.review.ok - x.review.no}</span></span>
                      </span>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className="col-actions">
                    <div className="row-actions">
                      {x.review
                        ? <a className="btn btn-sm btn-primary" href={`#/p/${x.p._id}/r/${x.review._id}`}>פתיחת ההשוואה</a>
                        : <button className="btn btn-sm btn-ghost" disabled={!canWrite} onClick={() => open(x)}>פתיחת בקרה</button>}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          {!shown.length && <div className="empty"><p>אין חוות דעת בסינון הזה.</p></div>}
        </div>
      </section>
    </div>
  );
}

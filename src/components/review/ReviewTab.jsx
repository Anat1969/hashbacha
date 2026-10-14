import React from 'react';
import { motion } from 'framer-motion';
import { api } from '../../lib/api.js';
import { formatDuration, daysBetween, parseDate } from '../../lib/calc.js';
import { ease } from '../ui.jsx';
import { ReviewPill } from './ReviewPill.jsx';
import ReviewPage from './ReviewPage.jsx';

export const readAuthor = () => { try { return localStorage.getItem('hashbacha-author') || ''; } catch { return ''; } };

// "שומות השבחה" tab: one review per opinion, or the comparison page of one review.
export default function ReviewTab({ ctx, entry, reviewId }) {
  if (reviewId) return <ReviewPage key={reviewId} ctx={ctx} entry={entry} reviewId={reviewId} />;
  return <ReviewList ctx={ctx} entry={entry} />;
}

function ReviewList({ ctx, entry }) {
  const p = entry.project;
  const reviews = (ctx.data.reviews || []).filter((r) => r.project_id === p._id);
  const canWrite = ctx.role !== 'viewer';

  async function open(o) {
    const id = await ctx.mutate((k) => api.reviewOpen(k, p._id, o._id, readAuthor()), 'נפתחה בקרת שומה');
    if (id && id !== true) window.location.hash = `#/p/${p._id}/r/${id}`;
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="label">שומת שמאי היזם מול שומת שמאי העירייה · השוואה לעמודת ייחוס</span>
          <h2 className="display-s">בקרת שומות השבחה</h2>
        </div>
        <div className="panel-actions">
          <ResearchLink ctx={ctx} />
        </div>
      </div>
      <p className="hint">
        לכל חוות דעת נפתחת בקרה נפרדת. בבקרה קולטים את שני הדוחות בתבנית האחידה, קובעים ערך ייחוס עם מקור לכל אחד מ־22 הפרמטרים,
        ומסמנים ✓ או ✗ בכל שורה. שורות ✗ הופכות למכתב הוראות לשמאי היזם וליזם.
      </p>
      <div className="opinion-list">
        {entry.opinions.map((o, i) => {
          const r = reviews.find((x) => x.opinion_id === o._id);
          const req = parseDate(o['תאריך קבלת בקשה']);
          return (
            <motion.article key={o._id} className="opinion-card review-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease, delay: i * 0.04 }}>
              <header className="opinion-head">
                <span className="opinion-num mono">{String(i + 1).padStart(2, '0')}</span>
                <div className="opinion-dates">
                  <span><span className="role">בקשה:</span> <span className="mono">{o['תאריך קבלת בקשה'] || '—'}</span></span>
                  <span><span className="role">שמאי יזם:</span> {o['שמאי מטעם היזם'] || '—'}</span>
                  <span><span className="role">שמאי עירייה:</span> {o['שמאי מטעם העירייה'] || '—'}</span>
                </div>
                <ReviewPill review={r} empty="טרם נפתחה בקרה" />
                <div className="row-actions">
                  {r ? <a className="btn btn-sm btn-primary" href={`#/p/${p._id}/r/${r._id}`}>פתיחת ההשוואה</a>
                    : <button className="btn btn-sm btn-ghost" onClick={() => open(o)} disabled={!canWrite}>פתיחת בקרה לחוות דעת זו</button>}
                </div>
              </header>
              {r && (
                <p className="review-progress">
                  <span><span className="role">סבב</span> <span className="mono">{r.round}</span></span>
                  <span className="ok-text"><span className="role">אושרו</span> <span className="mono">{r.ok}</span></span>
                  <span className="no-text"><span className="role">נדחו</span> <span className="mono">{r.no}</span></span>
                  <span><span className="role">ממתינים</span> <span className="mono">{22 - r.ok - r.no}</span></span>
                  {req && <span className="muted">מאז הבקשה: {formatDuration(daysBetween(req, new Date()))}</span>}
                </p>
              )}
            </motion.article>
          );
        })}
        {entry.opinions.length === 0 && (
          <div className="empty">
            <p>אין עדיין חוות דעת בפרויקט. בקרת שומה נפתחת לחוות דעת מסוימת.</p>
            <a className="btn btn-ghost" href={`#/p/${p._id}`}>להוספת חוות דעת בלשונית "פרויקט ומעקב"</a>
          </div>
        )}
      </div>
      {!canWrite && <p className="hint">לקוד הכניסה הזה יש הרשאת צפייה בלבד.</p>}
    </section>
  );
}

// Opens the Claude project where the review rules were researched (link set in Settings).
export function ResearchLink({ ctx }) {
  const url = (ctx.data.settings || {}).researchUrl;
  if (!url) return <span className="hint">קישור לפרויקט המחקר ב־Claude נשמר בהגדרות</span>;
  return <a className="btn btn-ghost" href={url} target="_blank" rel="noreferrer">פרויקט המחקר ב־Claude</a>;
}

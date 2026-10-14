import React from 'react';
import { REVIEW_STATUS } from '../../lib/review/rules.js';

// The most recently active review of a project (one per opinion; the list shows the latest).
export function reviewOf(reviews, projectId) {
  let best = null;
  for (const r of reviews) if (r.project_id === projectId && (!best || String(r.updated_at) > String(best.updated_at))) best = r;
  return best;
}

// Same pill as the project status, mapped to review statuses.
export function ReviewPill({ review, empty = '—' }) {
  if (!review) return <span className="muted">{empty}</span>;
  const s = REVIEW_STATUS[review.status] || REVIEW_STATUS.waiting_for_reports;
  return <span className={`pill pill-${s.tone}`}>{s.label}{review.round > 1 ? ` · סבב ${review.round}` : ''}</span>;
}

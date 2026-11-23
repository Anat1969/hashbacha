import { TML2023 } from './tml2023.js';
import { TML2022 } from './tml2022.js';
import { TML2047 } from './tml2047.js';
import { CARDS } from './compare.js';

export { SOURCES } from './tml2023.js';
export const REPORTS = [TML2023, TML2022, TML2047];
export const findReport = (id) => REPORTS.find((r) => r.id === id) || null;

// A report belongs to the project whose plan-number field holds one of its plan keys (punctuation ignored).
const PLAN_FIELD = "מס' תכנית/ מס זמני";
const squash = (x) => String(x || '').replace(/["'׳״/\\\s\-_.]/g, '');
// Returns report cards (digital documents and comparison-only reports alike).
export const reportsForProject = (project) => {
  const plan = squash(project?.[PLAN_FIELD]);
  return plan ? CARDS.filter((r) => r.planKeys.some((k) => plan.includes(squash(k)))) : [];
};
export const projectForReport = (report, projects = []) => projects.find((e) => reportsForProject(e.project).some((c) => c.id === report.id)) || null;
export const reportHref = (card) => (card.digital ? `#/d/${card.id}` : '#/d/compare');

// Sensitivity model for a feasibility calculation (thousands of ₪), driven by each report's `model`.
// It is ours, not the appraiser's: each cost line follows the driver the report itself ties it to.
// With simBase(model) it returns the report's own bottom line exactly.
export const simBase = (m) => ({ price: 0, build: 0, months: m.months, levy: m.levyRate });

export function simulate(m, { price = 0, build = 0, months = m.months, levy = m.levyRate } = {}) {
  const p = price / 100, c = build / 100, t = months / m.months;
  const buildDelta = (m.direct + m.byDirect) * c;
  const revenue = m.revenue * (1 + p);
  const cost = m.cost
    + m.byRevenue * p
    + buildDelta
    + m.byTime * (t - 1)
    + m.interest * (t * (1 + buildDelta / m.financed) - 1)
    + m.levy * (levy / m.levyRate - 1);
  const profit = revenue - cost;
  return { revenue, cost, profit, onCost: (profit / cost) * 100, onSales: (profit / revenue) * 100 };
}

// The price drop (in %) at which the profit is gone, everything else unchanged.
export const breakEvenPrice = (m) => -((m.revenue - m.cost) / (m.revenue - m.byRevenue)) * 100;

export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const million = (thousands, digits = 1) => (thousands / 1000).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

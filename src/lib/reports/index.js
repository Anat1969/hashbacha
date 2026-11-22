import { TML2023 } from './tml2023.js';

export { SOURCES } from './tml2023.js';
export const REPORTS = [TML2023];
export const findReport = (id) => REPORTS.find((r) => r.id === id) || null;

// A report belongs to the project whose plan-number field holds one of its plan keys (punctuation ignored).
const PLAN_FIELD = "מס' תכנית/ מס זמני";
const squash = (x) => String(x || '').replace(/["'׳״/\\\s\-_.]/g, '');
export const reportsForProject = (project) => {
  const plan = squash(project?.[PLAN_FIELD]);
  return plan ? REPORTS.filter((r) => (r.planKeys || []).some((k) => plan.includes(squash(k)))) : [];
};
export const projectForReport = (report, projects = []) => projects.find((e) => reportsForProject(e.project).includes(report)) || null;

export const SIM_BASE = { price: 0, build: 0, months: 48, levy: 50 };

// Sensitivity model for the feasibility calculation (thousands of ₪).
// It is ours, not the appraiser's: each cost line follows the driver the report itself ties it to.
// With SIM_BASE it returns the report's own bottom line exactly.
const M = {
  revenue: 937354, cost: 777991,
  byRevenue: 18747 + 16309 + 14998, // marketing 2%, legal 1.5%, sale-law guarantee 0.8%
  direct: 410854 + 85423 + 24107, // direct construction: developer, owners, public
  byDirect: 20543 + 10271 + 333 + 4271 + 2136 + 1205 + 603 + 362, // contingency, supervision, planning %
  byTime: 19536 + 720, // owners' rent and tenants' supervisor
  interest: 31645 + 2877, // interest and bank fee
  levy: 43900, levyRate: 50, months: 48,
  financed: 1526 + 513325 + 128011 + 32552 // costs before financing and levy
};

export function simulate({ price = 0, build = 0, months = 48, levy = 50 } = {}) {
  const p = price / 100, c = build / 100, t = months / M.months;
  const buildDelta = (M.direct + M.byDirect) * c;
  const revenue = M.revenue * (1 + p);
  const cost = M.cost
    + M.byRevenue * p
    + buildDelta
    + M.byTime * (t - 1)
    + M.interest * (t * (1 + buildDelta / M.financed) - 1)
    + M.levy * (levy / M.levyRate - 1);
  const profit = revenue - cost;
  return { revenue, cost, profit, onCost: (profit / cost) * 100, onSales: (profit / revenue) * 100 };
}

// The price drop (in %) at which the profit is gone, everything else unchanged.
export function breakEvenPrice() {
  const base = simulate(SIM_BASE);
  return -(base.profit / (M.revenue - M.byRevenue)) * 100;
}

export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const million = (thousands, digits = 1) => (thousands / 1000).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

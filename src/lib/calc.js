import { PROFIT_THRESHOLD } from './config.js';

// Accepts "18.6%", "10-16%", "3%-5%", "12%   18%". Ranges resolve to their midpoint.
export function parsePercent(str) {
  if (str === null || str === undefined) return null;
  const nums = String(str).match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const vals = nums.slice(0, 2).map(Number);
  if (vals.some((v) => v > 100)) return null;
  return vals.length === 2 ? (vals[0] + vals[1]) / 2 : vals[0];
}

export function isRange(str) {
  const nums = String(str || '').match(/\d+(?:\.\d+)?/g);
  return !!nums && nums.length >= 2;
}

export function calcGap(dev, city) {
  const d = parsePercent(dev);
  const c = parsePercent(city);
  if (d === null || c === null) return { value: null, text: '', tone: '' };
  const g = d - c;
  if (Math.abs(g) < 0.01) return { value: 0, text: '0%', tone: '' };
  return g > 0
    ? { value: g, text: '+' + g.toFixed(1) + '%', tone: 'dev' }
    : { value: g, text: g.toFixed(1) + '%', tone: 'city' };
}

export function avgDevProfit(entry) {
  const vals = entry.opinions.map((o) => parsePercent(o['רווחיות יזם (%)'])).filter((v) => v !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function latestDevProfit(entry) {
  for (let i = entry.opinions.length - 1; i >= 0; i--) {
    const v = parsePercent(entry.opinions[i]['רווחיות יזם (%)']);
    if (v !== null) return v;
  }
  return null;
}

// Green below the threshold, amber at it, red above. Matches the legacy scale.
export function profitColor(p) {
  if (p === null || p === undefined) return 'var(--ink-4)';
  const v = Math.max(0, Math.min(30, p));
  let r, g, b;
  if (v <= PROFIT_THRESHOLD) {
    const t = v / PROFIT_THRESHOLD;
    r = 39 + t * (196 - 39); g = 150 + t * (150 - 150); b = 90 + t * (30 - 90);
  } else {
    const t = (v - PROFIT_THRESHOLD) / PROFIT_THRESHOLD;
    r = 196 + t * (180 - 196); g = 150 + t * (50 - 150); b = 30 + t * (40 - 30);
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export function parseDate(str) {
  const m = String(str || '').match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

export function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

export function todayStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Appends a dated line for whatever was added to the notes; a full rewrite gets a fresh stamp.
export function stampNotes(original, next) {
  const o = (original || '').trim();
  const n = (next || '').trim();
  if (!n || n === o) return next;
  if (!o) return `${todayStamp()}: ${n}`;
  if (n.startsWith(o)) {
    const added = n.slice(o.length).trim();
    return added ? `${o}\n${todayStamp()}: ${added}` : o;
  }
  return `${todayStamp()}: ${n}`;
}

export function flatOpinions(projects) {
  const out = [];
  projects.forEach((entry) => {
    const p = entry.project;
    entry.opinions.forEach((o, idx) => {
      const dev = parsePercent(o['רווחיות יזם (%)']);
      const city = parsePercent(o['רווחיות עירייה (%)']);
      const req = parseDate(o['תאריך קבלת בקשה']);
      const got = parseDate(o['תאריך קבלת חוו"ד']);
      out.push({
        projectId: p._id,
        opinionId: o._id,
        idx,
        developer: (p['שם היזם'] || '').trim() || 'לא ידוע',
        address: p['כתובת הפרויקט'] || '',
        devAppraiser: (o['שמאי מטעם היזם'] || '').trim(),
        cityAppraiser: (o['שמאי מטעם העירייה'] || '').trim(),
        dev, city,
        gap: dev !== null && city !== null ? dev - city : null,
        req, got,
        turnaround: req && got && got >= req ? daysBetween(req, got) : null
      });
    });
  });
  return out;
}

export function overview(projects, now = new Date()) {
  const ops = flatOpinions(projects);
  const devVals = ops.map((o) => o.dev).filter((v) => v !== null);
  const avgDev = devVals.length ? devVals.reduce((a, b) => a + b, 0) / devVals.length : null;
  const above = devVals.filter((v) => v > PROFIT_THRESHOLD).length;
  const turn = ops.map((o) => o.turnaround).filter((v) => v !== null);
  const medianTurn = turn.length ? turn.slice().sort((a, b) => a - b)[Math.floor(turn.length / 2)] : null;
  // Only a project's latest opinion can be "open"; earlier rows were superseded.
  const lastIdx = new Map();
  ops.forEach((o) => lastIdx.set(o.projectId, o.idx));
  const open = ops
    .filter((o) => o.req && !o.got && lastIdx.get(o.projectId) === o.idx)
    .map((o) => ({ ...o, waiting: daysBetween(o.req, now) }))
    .sort((a, b) => b.waiting - a.waiting);
  const status = { 'הוגש': 0, 'בטיפול': 0, 'בוצע': 0, '': 0 };
  projects.forEach((e) => { const s = e.project['סטטוס רמזור'] || ''; status[s in status ? s : ''] += 1; });
  return {
    projects: projects.length,
    opinions: ops.length,
    avgDev,
    abovePct: devVals.length ? (above / devVals.length) * 100 : null,
    medianTurn,
    open,
    status
  };
}

export function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

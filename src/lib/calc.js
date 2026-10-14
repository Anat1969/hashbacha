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

// Danger scale against the benchmark: green below it (paler as it nears), red above it (deeper as it climbs).
export function profitColor(p) {
  if (p === null || p === undefined) return 'var(--ink-4)';
  const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
  const DEEP_GREEN = [24, 112, 66], SOFT_GREEN = [120, 168, 96];
  const SOFT_RED = [214, 104, 84], DEEP_RED = [150, 28, 22];
  const c = p <= PROFIT_THRESHOLD
    ? mix(DEEP_GREEN, SOFT_GREEN, Math.max(0, p) / PROFIT_THRESHOLD)
    : mix(SOFT_RED, DEEP_RED, Math.min(1, (p - PROFIT_THRESHOLD) / 10));
  return `rgb(${c.join(',')})`;
}

// For a gap the risk is the size of the disagreement, whichever side is higher.
export const GAP_ALERT = 3;
export function gapColor(g) {
  if (g === null || g === undefined) return 'var(--ink-4)';
  const a = Math.abs(g);
  const mix = (x, y, t) => x.map((v, i) => Math.round(v + (y[i] - v) * t));
  const c = a <= GAP_ALERT ? mix([24, 112, 66], [120, 168, 96], a / GAP_ALERT) : mix([214, 104, 84], [150, 28, 22], Math.min(1, (a - GAP_ALERT) / 5));
  return `rgb(${c.join(',')})`;
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
        plan: p['שם התכנית'] || p['כתובת הפרויקט'] || '',
        quarter: p['רובע'] || '',
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
  const open = projects
    .map((e) => ({ e, f: followUp(e, now) }))
    .filter(({ f }) => f)
    .map(({ e, f }) => ({
      ...f,
      projectId: e.project._id,
      developer: (e.project['שם היזם'] || '').trim() || 'לא ידוע',
      plan: e.project['שם התכנית'] || '',
      address: e.project['כתובת הפרויקט'] || '',
      waiting: f.days
    }))
    .sort((a, b) => b.waiting - a.waiting);
  const status = { 'הוגש': 0, 'בטיפול': 0, 'בוצע': 0, '': 0 };
  projects.forEach((e) => { const s = e.project['סטטוס רמזור'] || ''; status[s in status ? s : ''] += 1; });
  return {
    projects: projects.length,
    opinions: ops.length,
    devCount: devVals.length,
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

// "2 שנים, 3 חודשים ו־12 ימים"
export function formatDuration(days) {
  if (days === null || days === undefined) return '—';
  if (days < 0) return '—';
  const y = Math.floor(days / 365);
  const m = Math.floor((days % 365) / 30);
  const d = (days % 365) % 30;
  const parts = [];
  if (y) parts.push(y === 1 ? 'שנה' : y === 2 ? 'שנתיים' : `${y} שנים`);
  if (m) parts.push(m === 1 ? 'חודש' : m === 2 ? 'חודשיים' : `${m} חודשים`);
  if (d || !parts.length) parts.push(d === 1 ? 'יום' : `${d} ימים`);
  return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' ו־' + parts[parts.length - 1] : parts[0];
}

export const FOLLOW_OPTIONS = ['שמאי העירייה', 'שמאי היזם', 'היזם', 'העירייה'];

// Who the latest open request is waiting on. Explicit field wins; otherwise inferred from the notes.
export function followUp(entry, now = new Date()) {
  const ops = entry.opinions;
  if (!ops.length) return null;
  const o = ops[ops.length - 1];
  const req = parseDate(o['תאריך קבלת בקשה']);
  const got = parseDate(o['תאריך קבלת חוו"ד']);
  if (!req || got) return null;
  const explicit = (o['ממתין ל'] || '').trim();
  const notes = o['הערות / סטטוס'] || '';
  let who = explicit;
  let inferred = false;
  if (!who) {
    inferred = true;
    who = /ממתין/.test(notes) && /היזם/.test(notes) ? 'היזם' : 'שמאי העירייה';
  }
  const name = who === 'שמאי העירייה' ? (o['שמאי מטעם העירייה'] || '').trim()
    : who === 'שמאי היזם' ? (o['שמאי מטעם היזם'] || '').trim()
    : who === 'היזם' ? (entry.project['שם היזם'] || '').trim() : '';
  return { who, name, inferred, since: req, days: daysBetween(req, now), opinion: o };
}

export const SIDE = (who) => (who === 'שמאי העירייה' || who === 'העירייה' ? 'city' : 'dev');

// Every keyword must appear somewhere in the project or its opinions.
export function matchKeywords(entry, query, notes = []) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [
    ...Object.values(entry.project),
    ...entry.opinions.flatMap((o) => Object.values(o)),
    ...notes.map((n) => n.body)
  ].join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

export const REPORT_FIELDS = [
  { key: 'מס יחידות קימיות', label: 'מספר יחידות קיימות' },
  { key: 'סה"כ יחידות בתכנית', label: 'סך יחידות בתכנית' },
  { key: 'רווחיות יזם (%)', label: 'שיעור רווחיות היזם בדוח הכלכלי' },
  { key: 'דו"ח אחרון מעודכן', label: 'תאריך הדוח הכלכלי המעודכן' },
  { key: 'שמאי מטעם היזם', label: 'שם שמאי היזם' },
  { key: 'תאריך קבלת בקשה', label: 'תאריך הגשת הבקשה' }
];

export function missingReportFields(opinion) {
  if (!opinion) return REPORT_FIELDS.slice();
  return REPORT_FIELDS.filter((f) => !String(opinion[f.key] || '').trim());
}

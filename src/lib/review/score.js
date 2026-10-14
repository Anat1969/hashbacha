// Pure scoring functions ported from docs/hashbacha/reference/index.html (logic only).
import { PARAMS } from './rules.js';

export const num = (v) => (v === '' || v == null ? NaN : Number(String(v).replace(/,/g, '').trim()));
export const fmt = (v) => { const n = num(v); return Number.isFinite(n) ? n.toLocaleString('he-IL', { maximumFractionDigits: 2 }) : String(v ?? ''); };
export const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const empty = (v) => v === '' || v == null || (typeof v === 'string' && !v.trim());

export function tolText(r, N) {
  if (r.type === 'match') return 'זהות מלאה';
  if (r.type === 'min') return empty(N) ? 'לפחות כערך הייחוס' : `לפחות ${fmt(N)}`;
  if (r.tolType === 'rel') return `±${(r.tol * 100).toLocaleString('he-IL', { maximumFractionDigits: 1 })}%`;
  return r.tol === 0 ? 'זהות מלאה' : `±${fmt(r.tol)}${r.unit.startsWith('%') ? ' נק׳' : ' ' + r.unit}`;
}

// One side against the reference: in / out of range, distance, deviation text, position on the scale.
export function assess(r, v, N) {
  if (empty(v)) return { state: 'missing' };
  if (empty(N)) return { state: 'noref' };
  if (r.type === 'match') {
    const ok = norm(v) === norm(N);
    return { state: ok ? 'in' : 'out', dist: ok ? 0 : 1, txt: ok ? 'תואם לייחוס' : 'לא תואם לייחוס' };
  }
  const n = num(v); const ref = num(N);
  if (!Number.isFinite(n) || !Number.isFinite(ref)) return { state: 'missing' };
  if (r.type === 'min') {
    const ok = n >= ref;
    return { state: ok ? 'in' : 'out', dist: Math.max(0, ref - n), txt: ok ? 'עומד בסף' : `חסרות ${fmt(ref - n)}` };
  }
  const d = r.tolType === 'rel' ? (ref === 0 ? 0 : (n - ref) / ref) : n - ref;
  const ok = Math.abs(d) <= r.tol + 1e-9;
  const sign = d > 0 ? '+' : d < 0 ? '−' : '';
  const txt = r.tolType === 'rel'
    ? `${sign}${Math.abs(d * 100).toLocaleString('he-IL', { maximumFractionDigits: 1 })}% מהייחוס`
    : d === 0 ? 'זהה לייחוס' : `${sign}${fmt(Math.abs(d))}${r.unit.startsWith('%') ? ' נק׳' : ' ' + r.unit} מהייחוס`;
  const pos = r.tol > 0 ? 50 + Math.max(-1, Math.min(1, d / (2 * r.tol))) * 50 : null;
  return { state: ok ? 'in' : 'out', dist: Math.abs(d), txt, pos };
}

// Marking rules: range first, closeness second. cls: good | bad | none.
export function compare(r, row = {}) {
  const a = assess(r, row.D, row.N); const b = assess(r, row.M, row.N);
  const res = { D: { ...a, cls: 'none', label: '' }, M: { ...b, cls: 'none', label: '' } };
  const lab = (s) => (s.state === 'missing' ? 'חסר' : s.state === 'noref' ? 'אין ייחוס' : '');
  res.D.label = lab(a); res.M.label = lab(b);
  const okA = a.state === 'in'; const okB = b.state === 'in';
  const has = (s) => s.state === 'in' || s.state === 'out';
  if (has(a) && has(b)) {
    if (okA && okB) {
      if (Math.abs(a.dist - b.dist) < 1e-9) { res.D.cls = res.M.cls = 'good'; res.D.label = res.M.label = 'קרוב באותה מידה'; } else {
        const aw = a.dist < b.dist;
        res.D.cls = aw ? 'good' : 'bad'; res.M.cls = aw ? 'bad' : 'good';
        res.D.label = aw ? 'קרוב יותר' : 'רחוק יותר'; res.M.label = aw ? 'רחוק יותר' : 'קרוב יותר';
      }
    } else if (okA || okB) {
      res.D.cls = okA ? 'good' : 'bad'; res.M.cls = okB ? 'good' : 'bad';
      res.D.label = okA ? 'בטווח' : 'חריגה'; res.M.label = okB ? 'בטווח' : 'חריגה';
    } else {
      res.D.cls = res.M.cls = 'bad';
      const aw = a.dist < b.dist - 1e-9; const bw = b.dist < a.dist - 1e-9;
      res.D.label = 'חריגה' + (aw ? ' · קרובה יותר' : ''); res.M.label = 'חריגה' + (bw ? ' · קרובה יותר' : '');
    }
  } else {
    if (has(a)) { res.D.cls = okA ? 'good' : 'bad'; res.D.label = okA ? 'בטווח' : 'חריגה'; }
    if (has(b)) { res.M.cls = okB ? 'good' : 'bad'; res.M.label = okB ? 'בטווח' : 'חריגה'; }
  }
  return res;
}

// Per side: green rows and exceedances. Review progress from marks.
export function summary(params = {}, marks = {}) {
  const rows = PARAMS.map((r) => ({ r, c: compare(r, params[r.id]) }));
  const side = (k) => ({
    good: rows.filter((x) => x.c[k].cls === 'good').length,
    exceed: rows.filter((x) => x.c[k].label.startsWith('חריגה')).length
  });
  const ok = PARAMS.filter((r) => marks[r.id]?.verdict === 'ok').length;
  const no = PARAMS.filter((r) => marks[r.id]?.verdict === 'no').length;
  return { D: side('D'), M: side('M'), ok, no, pending: PARAMS.length - ok - no, total: PARAMS.length };
}

// Derived levy = r22 × r3 / 100 (₪ million), per column; not scored.
export function levy(params = {}, k) {
  const b = num(params.r22?.[k]); const t = num(params.r3?.[k]);
  return Number.isFinite(b) && Number.isFinite(t) ? Math.round(b * t) / 100 : null;
}

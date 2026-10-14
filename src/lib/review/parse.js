// Reads a report in the fixed template (docs/hashbacha/rules.md, "Import template").
import { KIND, PARAMS } from './rules.js';
import { norm, num } from './score.js';

// rows: array of arrays from the first sheet. Returns meta, values per code, and the target slot.
export function parseReport(rows) {
  const meta = {}; let hi = -1;
  rows.forEach((r, i) => {
    const k = norm(r?.[0]);
    if (hi < 0 && k === 'קוד') hi = i;
    else if (hi < 0 && k && r[1] != null) meta[k] = norm(r[1]);
  });
  if (hi < 0) throw new Error('לא נמצאה שורת כותרות שמתחילה ב"קוד". יש להשתמש בתבנית האחידה.');
  const head = rows[hi].map(norm);
  const cv = head.indexOf('ערך'); const cs = head.indexOf('מקור / הסבר');
  if (cv < 0) throw new Error('חסרה עמודת "ערך" בשורת הכותרות.');
  const vals = {};
  for (const r of rows.slice(hi + 1)) {
    const code = norm(r?.[0]).toLowerCase();
    if (/^r\d+$/.test(code)) vals[code] = { v: r[cv], note: cs >= 0 ? norm(r[cs]) : '' };
  }
  return { meta, vals, slot: KIND[meta['סוג דוח']] || null };
}

// Cleans the values for one slot and lists what needs a second look.
export function prepareImport({ meta, vals }, slot, projectName) {
  const parsed = {}; const warn = []; let filled = 0;
  for (const r of PARAMS) {
    const x = vals[r.id];
    if (!x || x.v == null || norm(x.v) === '') { warn.push(`${r.label}: חסר ערך`); parsed[r.id] = { v: '', note: '' }; continue; }
    let v;
    if (r.type !== 'match') {
      const n = num(x.v);
      if (!Number.isFinite(n)) { warn.push(`${r.label}: "${norm(x.v)}" אינו מספר`); parsed[r.id] = { v: '', note: x.note }; continue; }
      v = n;
    } else v = norm(x.v);
    if (slot !== 'N' && !x.note) warn.push(`${r.label}: ללא מקור או הסבר`);
    parsed[r.id] = { v, note: x.note };
    filled++;
  }
  if (meta['שם הפרויקט'] && projectName && norm(meta['שם הפרויקט']) !== norm(projectName)) {
    warn.unshift(`שם הפרויקט בקובץ ("${meta['שם הפרויקט']}") שונה מהפרויקט. כדאי לוודא שהקובץ שייך לפרויקט הזה.`);
  }
  return { parsed, warn, filled };
}

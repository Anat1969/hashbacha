// Unit checks: parse the three sample reports and score them by docs/hashbacha/rules.md.
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { PARAMS } from '../src/lib/review/rules.js';
import { compare, summary, levy, assess } from '../src/lib/review/score.js';
import { parseReport, prepareImport, WARN_KINDS } from '../src/lib/review/parse.js';
import vm from 'node:vm';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const read = (f) => { const wb = XLSX.read(readFileSync(`docs/hashbacha/templates/${f}`), { type: 'buffer' }); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }); };

const params = {};
for (const [f, slot] of [['sample-developer.xlsx', 'D'], ['sample-municipality.xlsx', 'M'], ['sample-reference.xlsx', 'N']]) {
  const rep = parseReport(read(f));
  ok(rep.slot === slot, `${f}: report type → ${slot}`);
  const { parsed, filled } = prepareImport(rep, slot, '');
  ok(filled === 22, `${f}: 22 values filled (${filled})`);
  PARAMS.forEach((r) => { params[r.id] = { ...(params[r.id] || {}), [slot]: parsed[r.id].v, ...(slot === 'N' ? { src: parsed[r.id].note } : {}) }; });
}
ok(params.r3.N === 25 && typeof params.r5.D === 'number' && params.r1.D === '12.03.2025', 'numbers as numbers, match fields as text');

// The four marking cases from rules.md.
const R = (id) => PARAMS.find((r) => r.id === id);
let c = compare(R('r5'), { N: 20000, D: 20100, M: 19000 }); // both in ±8%, D closer
ok(c.D.cls === 'good' && c.D.label === 'קרוב יותר' && c.M.cls === 'bad' && c.M.label === 'רחוק יותר', 'case 1: both in range, closer is green');
c = compare(R('r5'), { N: 20000, D: 20500, M: 19500 });
ok(c.D.cls === 'good' && c.M.cls === 'good', 'case 1: equal distance, both green');
c = compare(R('r5'), { N: 20000, D: 25000, M: 20000 });
ok(c.D.label === 'חריגה' && c.M.label === 'בטווח' && c.M.cls === 'good', 'case 2: one in range');
c = compare(R('r5'), { N: 20000, D: 25000, M: 30000 });
ok(c.D.cls === 'bad' && c.M.cls === 'bad' && c.D.label === 'חריגה · קרובה יותר' && c.M.label === 'חריגה', 'case 3: both out, closer labelled');
c = compare(R('r5'), { N: '', D: 1, M: '' });
ok(c.D.label === 'אין ייחוס' && c.M.label === 'חסר', 'case 4: missing value / missing reference are grey');
ok(assess(R('r12'), 8, 6).state === 'in' && assess(R('r12'), 4, 6).state === 'out', 'min rule (r12)');
ok(assess(R('r1'), ' 12.03.2025', '12.03.2025 ').state === 'in', 'match rule is whitespace-normalised');

const s = summary(params, { r1: { verdict: 'ok' }, r2: { verdict: 'no' } });
ok(s.ok === 1 && s.no === 1 && s.pending === 20, 'review progress counts');
ok(s.D.good + s.M.good > 0 && s.D.exceed >= 0, `sample summary D ${s.D.good}/${s.D.exceed}, M ${s.M.good}/${s.M.exceed}`);
ok(levy(params, 'N') === Math.round(params.r22.N * 25) / 100, `derived levy N = ${levy(params, 'N')}`);

// Exact port: run the reference page's own assess/compare next to ours on the same rows.
const html = readFileSync('docs/hashbacha/reference/index.html', 'utf8');
const src = html.slice(html.indexOf('const num='), html.indexOf('const esc=')) + html.slice(html.indexOf('function assess('), html.indexOf('function sideCell('));
const refCtx = {}; vm.runInNewContext(src + ';this.assess=assess;this.compare=compare;', refCtx);
const pick = (x) => JSON.stringify({ D: { ...x.D }, M: { ...x.M } });
let same = 0, diff = [];
const trial = (r, row) => { const a = pick(refCtx.compare({ ...r, ...row })); const b = pick(compare(r, row)); if (a === b) same++; else diff.push([r.id, row, a, b]); };
PARAMS.forEach((r) => trial(r, params[r.id]));
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 600; i++) {
  const r = PARAMS[i % 22];
  const N = r.type === 'match' ? ['א', 'ב'][i % 2] : Math.round(rnd() * 1000) / 10;
  const v = () => (rnd() < 0.08 ? '' : r.type === 'match' ? ['א', 'ב', ' א '][Math.floor(rnd() * 3)] : Math.round((N || 1) * (0.6 + rnd() * 0.8) * 100) / 100);
  trial(r, { N: rnd() < 0.05 ? '' : N, D: v(), M: v() });
}
ok(diff.length === 0, `compare()/assess() identical to reference/index.html on ${same} rows${diff.length ? ' · first diff ' + JSON.stringify(diff[0]) : ''}`);

// Import warnings by kind.
const bad = [['סוג דוח', 'יזם'], ['שם הפרויקט', 'פרויקט אחר'], ['קוד', 'פרק', 'פרמטר', 'יחידה', 'ערך', 'מקור / הסבר'], ['r1', '', '', '', '12.03.2025', 'x'], ['r4', '', '', '', 'אלף', 'x'], ['r5', '', '', '', 19000, '']];
const w = prepareImport(parseReport(bad), 'D', 'מתחם הדקל').warn;
const kinds = (k) => w.filter((x) => x.kind === k).length;
ok(kinds('project') === 1 && kinds('nonnumeric') === 1 && kinds('nosource') === 1 && kinds('missing') === 19, `warning kinds: project / non-numeric / no source / missing (${Object.keys(WARN_KINDS).map((k) => k + '=' + kinds(k)).join(', ')})`);
ok(parseReport(bad).slot === 'D' && parseReport([['קוד', 'ערך']]).slot === null, '"סוג דוח" routes the file; missing cell → no slot');

// Mail links must fit Gmail / Outlook / mailto; a long letter goes through the clipboard.
const { composeHref, LINK_LIMIT, PASTE_LINE } = await import('../src/lib/mail.js');
const { reviewLetterRequest } = await import('../src/lib/mailRequests.js');
const rows5 = PARAMS.slice(4, 9).map((r) => ({ chapter: 'מצב קודם', label: r.label, unit: r.unit, value: '21,000', ref: '19,500', src: 'עסקאות 24 חודשים במתחם ובסביבתו', deviation: '+7.7% מהייחוס', tol: '±8%', exceed: true, comment: 'נדרש מקור מפורט לעסקאות ההשוואה ולתאריכיהן' }));
const letterDraft = reviewLetterRequest({ p: { _id: 'p', 'שם התכנית': 'פרויקט ענת', 'שם היזם': 'יזם' }, opinion: { 'שמאי מטעם היזם': 'שמאי', 'תאריך קבלת בקשה': '01/09/2026' }, review: { round: 1 }, rows: rows5, settings: {} }).build();
for (const k of ['gmail', 'outlook', 'mailto']) {
  const r = composeHref(k, letterDraft);
  ok(r.href.length <= LINK_LIMIT[k] && r.trimmed && r.href.includes(encodeURIComponent(PASTE_LINE)), `5-row letter → ${k} link ${r.href.length} chars, body via clipboard`);
}
const short = composeHref('gmail', { to: 'a@b.c', subject: 'תזכורת', text: 'שלום, תזכורת קצרה.' });
ok(!short.trimmed && short.href.includes(encodeURIComponent('תזכורת קצרה')), 'short mail keeps its full body in the link');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

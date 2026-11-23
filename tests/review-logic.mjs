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

// Digital reports: the sensitivity model must reproduce the report's own bottom line.
const { REPORTS, simulate, simBase, breakEvenPrice } = await import('../src/lib/reports/index.js');
const rep = REPORTS[0];
const M0 = rep.model; const SIM_BASE = simBase(M0);
const b0 = simulate(M0, SIM_BASE);
ok(Math.round(b0.profit) === rep.result.profit && b0.onCost.toFixed(1) === '20.5' && b0.onSales.toFixed(1) === '17.0', `report model at base = report (${Math.round(b0.profit)}, ${b0.onCost.toFixed(1)}%, ${b0.onSales.toFixed(1)}%)`);
ok(rep.costs.reduce((a, c) => a + c.sum, 0) - rep.costTotal === 102 && rep.revenue.reduce((a, c) => a + c[1], 0) === rep.revenueTotal, 'report data: revenue lines sum to the total; cost lines differ from the stated total by the report\'s own 102');
ok(Math.abs(simulate(M0, { ...SIM_BASE, price: breakEvenPrice(M0) }).profit) < 1 && Math.round(breakEvenPrice(M0)) === -18, 'break-even price drop is 18%');
ok(Math.round(simulate(M0, { ...SIM_BASE, levy: 0 }).profit - b0.profit) === 43900 && simulate(M0, { ...SIM_BASE, build: 10 }).profit < b0.profit && simulate(M0, { ...SIM_BASE, months: 60 }).profit < b0.profit, 'levy exemption adds 43,900; dearer or longer construction lowers profit');
ok(rep.sales.reduce((a, x) => a + x[1], 0) === 422 && rep.sales.reduce((a, x) => a + x[5], 0) === 1031570, 'sales table: 422 developer units, 1,031,570 incl. VAT');

// Every digital report: its model reproduces its own bottom line, and its tables add up.
for (const r of REPORTS) {
  const b = simulate(r.model, simBase(r.model));
  ok(Math.abs(b.profit - r.result.profit) < 1 && b.onCost.toFixed(1) === r.result.onCost.toFixed(1) && b.onSales.toFixed(1) === r.result.onSales.toFixed(1), `${r.plan}: model at base = report (${Math.round(b.profit)}, ${b.onCost.toFixed(1)}%, ${b.onSales.toFixed(1)}%)`);
  const costGap = Math.abs(r.costs.reduce((a, c) => a + c.sum, 0) - r.costTotal);
  ok(r.revenue.reduce((a, c) => a + c[1], 0) === r.revenueTotal && costGap <= 102 && Math.abs(r.revenueTotal - r.costTotal - r.result.profit) <= 1, `${r.plan}: revenue lines, cost buckets (gap ${costGap}) and profit are consistent`);
  ok(Object.keys(r.params).length === 22 && r.layers.length === 6 && r.findings.every((x) => x.length === 4) && r.unitCosts.every((u) => ['dictated', 'judgement', 'legal'].includes(u[2])), `${r.plan}: 22 parameters, six layers, well-formed findings and sources`);
}
ok(REPORTS.length === 3 && Math.round(breakEvenPrice(REPORTS[1].model)) === -18 && Math.round(breakEvenPrice(REPORTS[2].model)) === -20, 'three digital reports; break-even price drops of 18%, 18% and 20%');

// Report comparison and project linking.
const cmp = await import('../src/lib/reports/compare.js');
const { reportsForProject } = await import('../src/lib/reports/index.js');
const cs = cmp.compareSummary();
ok(cs.reports === 3 && cs.topics === 18 && cs.core === 14 && cs.missing === 2 && cs.partial === 2 && cs.sameAssumptions === 6, `comparison summary: ${JSON.stringify(cs)}`);
ok([cmp.TOPICS, cmp.ASSUMPTIONS, cmp.FORM].every((t) => t.every((r) => r[r.length === 2 ? 1 : 2].length === 3)) && cmp.RESULTS.every((r) => r[1].length === 3), 'every comparison row has one value per report');
ok(cmp.RESULTS.find((r) => r[0] === 'רווח')[1].every((v, i) => Math.abs(v - (cmp.RESULTS[3][1][i] - cmp.RESULTS[4][1][i])) < 0.15), 'profit = revenue - cost in each compared report');
const plan = (v) => ({ "מס' תכנית/ מס זמני": v });
ok(reportsForProject(plan('603-0392696 תמ"ל 2023'))[0]?.id === 'tml2023' && reportsForProject(plan('תמ"ל 2047 2047'))[0]?.id === 'tml2047' && !reportsForProject(plan('תמ"ל 2021')).length && !reportsForProject(plan('')).length, 'reports match projects by plan number');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

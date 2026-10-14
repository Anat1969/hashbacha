// Unit checks: parse the three sample reports and score them by docs/hashbacha/rules.md.
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { PARAMS } from '../src/lib/review/rules.js';
import { compare, summary, levy, assess } from '../src/lib/review/score.js';
import { parseReport, prepareImport } from '../src/lib/review/parse.js';

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

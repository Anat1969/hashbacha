import { EXCEL_HEADERS, OPINION_FIELDS } from './fields.js';

const pad = (n) => String(n).padStart(2, '0');

export async function exportExcel(projects) {
  const XLSX = await import('xlsx');
  const rows = [EXCEL_HEADERS];
  let n = 0;
  projects.forEach(({ project: p, opinions }) => {
    const base = ['רובע', 'שם היזם', 'כתובת הפרויקט', "מס' תכנית/ מס זמני", 'שם התכנית', 'סטטוס רמזור', 'קישור'].map((k) => p[k] || '');
    const list = opinions.length ? opinions : [{}];
    list.forEach((o) => {
      n += 1;
      rows.push([n, ...base, ...OPINION_FIELDS.map((f) => o[f.key] || '')]);
    });
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = EXCEL_HEADERS.map(() => ({ wch: 16 }));
  ws['!views'] = [{ RTL: true }];
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'נתונים');
  const d = new Date();
  const name = `hashbacha-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`;
  XLSX.writeFile(wb, name);
  return name;
}

function normalizeStatus(t) {
  const s = String(t || '').trim();
  if (s === 'ירוק') return 'בוצע';
  if (s === 'צהוב') return 'בטיפול';
  if (s === 'אדום') return 'הוגש';
  return ['הוגש', 'בטיפול', 'בוצע'].includes(s) ? s : '';
}

// Rows sharing developer + plan number fold into one project with several opinions.
export async function parseExcel(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  if (rows.length < 2) return [];
  const idx = {};
  rows[0].forEach((h, i) => { idx[String(h).trim()] = i; });
  const map = new Map();
  const list = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;
    const val = (k) => (idx[k] !== undefined && row[idx[k]] != null ? String(row[idx[k]]) : '');
    const key = (val('שם היזם') + '||' + val("מס' תכנית/ מס זמני")).toLowerCase();
    if (key === '||' && !val('כתובת הפרויקט')) continue;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        project: {
          'רובע': val('רובע'),
          'שם היזם': val('שם היזם'),
          'כתובת הפרויקט': val('כתובת הפרויקט'),
          "מס' תכנית/ מס זמני": val("מס' תכנית/ מס זמני"),
          'שם התכנית': val('שם התכנית'),
          'סטטוס רמזור': normalizeStatus(val('סטטוס רמזור')),
          'קישור': val('קישור')
        },
        opinions: []
      };
      map.set(key, entry);
      list.push(entry);
    }
    const o = {};
    OPINION_FIELDS.forEach((f) => { o[f.key] = val(f.key); });
    if (OPINION_FIELDS.some((f) => o[f.key].trim())) entry.opinions.push(o);
  }
  return list;
}

// Pulls sender, date and subject out of an email pasted from Outlook or Gmail (Hebrew or English headers).
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  'ינואר': 0, 'פברואר': 1, 'מרץ': 2, 'אפריל': 3, 'מאי': 4, 'יוני': 5, 'יולי': 6, 'אוגוסט': 7, 'ספטמבר': 8, 'אוקטובר': 9, 'נובמבר': 10, 'דצמבר': 11 };

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseMailDate(text) {
  if (!text) return '';
  let m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = text.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  m = text.match(/([A-Za-z֐-׿]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] !== undefined) return iso(new Date(Number(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], Number(m[2])));
  if (m && MONTHS[m[1]] !== undefined) return iso(new Date(Number(m[3]), MONTHS[m[1]], Number(m[2])));
  m = text.match(/(\d{1,2})\s+(?:ב)?([A-Za-z֐-׿]+)\.?,?\s+(\d{4})/);
  if (m) {
    const k = MONTHS[m[2]] ?? MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (k !== undefined) return iso(new Date(Number(m[3]), k, Number(m[1])));
  }
  return '';
}

function header(lines, names) {
  for (const line of lines.slice(0, 25)) {
    const m = line.match(new RegExp(`^\\s*(?:${names.join('|')})\\s*:\\s*(.+)$`, 'i'));
    if (m) return m[1].trim();
  }
  return '';
}

export function parseMail(raw) {
  const text = (raw || '').replace(/\r/g, '');
  const lines = text.split('\n');
  const from = header(lines, ['From', 'מאת', 'מאת המשתמש']);
  const subject = header(lines, ['Subject', 'נושא']);
  const dateLine = header(lines, ['Sent', 'Date', 'נשלח', 'תאריך', 'נשלח בתאריך']);
  const to = header(lines, ['To', 'אל']);
  const email = (from.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [''])[0];
  const name = from.replace(/<[^>]*>/, '').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/, '').replace(/["[\]]/g, '').trim();
  // Body: everything after the last header line near the top.
  let start = 0;
  lines.slice(0, 25).forEach((l, i) => { if (/^\s*(From|Sent|Date|To|Cc|Subject|מאת|נשלח|תאריך|אל|עותק|נושא)\s*:/i.test(l)) start = i + 1; });
  const body = lines.slice(start).join('\n').trim();
  return { fromName: name, fromEmail: email, subject, date: parseMailDate(dateLine) || parseMailDate(text), to, body: body || text.trim() };
}

// Best guess of the project a mail belongs to: plan number, plan name, developer or address appearing in it.
export function guessProject(projects, text) {
  const t = (text || '').toLowerCase();
  let best = null; let score = 0;
  projects.forEach((e) => {
    const p = e.project;
    let s = 0;
    const plan = (p["מס' תכנית/ מס זמני"] || '').match(/\d{3}-\d{7}/g) || [];
    plan.forEach((n) => { if (t.includes(n)) s += 5; });
    [['שם התכנית', 3], ['שם היזם', 2], ['כתובת הפרויקט', 2]].forEach(([k, w]) => {
      const v = (p[k] || '').trim().toLowerCase();
      if (v.length > 2 && t.includes(v)) s += w;
    });
    if (s > score) { score = s; best = p._id; }
  });
  return best;
}

// Who sent it, judged against the project's appraisers, the developer and the saved contacts.
export function guessRole(entry, contacts, fromName, fromEmail) {
  const n = (fromName || '').trim();
  const em = (fromEmail || '').toLowerCase();
  const c = (contacts || []).find((x) => (em && x.email && x.email.toLowerCase() === em) || (n && x.name && (n.includes(x.name) || x.name.includes(n))));
  if (c) return c.role === 'שמאי עירייה' ? 'שמאי העירייה' : c.role === 'שמאי יזם' ? 'שמאי היזם' : c.role === 'יזם' ? 'היזם' : c.role;
  if (!entry || !n) return '';
  const has = (v) => v && (v.includes(n) || n.includes(v.trim()));
  if (entry.opinions.some((o) => has(o['שמאי מטעם העירייה']))) return 'שמאי העירייה';
  if (entry.opinions.some((o) => has(o['שמאי מטעם היזם']))) return 'שמאי היזם';
  if (has(entry.project['שם היזם'])) return 'היזם';
  return '';
}

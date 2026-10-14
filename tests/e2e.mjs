// End-to-end: real build served by `vite preview`, Supabase RPCs answered by an in-memory mock.
// Every button is exercised and the outgoing RPC payload is asserted.
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { chromium } from 'playwright-core';

const KEY = 'HB-TEST-TEST-TEST';
const BASE = 'http://localhost:4173';
const SHOTS = 'tests/screens';
mkdirSync(SHOTS, { recursive: true });

// ---------- Mock backend ----------
const ctx = { window: {} };
vm.runInNewContext(readFileSync('legacy/public/data.js', 'utf8'), ctx);
const db = {
  settings: { ilanitEmail: 'ilanit@example.org', planningEmail: 'plan@example.org' },
  projects: ctx.window.SEED_DATA.projects.map((e) => ({
    id: randomUUID(), deleted: null, data: strip(e.project),
    opinions: e.opinions.map((o) => ({ id: randomUUID(), deleted: null, data: strip(o) }))
  })),
  activity: [],
  notes: []
};
function strip(o) { const c = { ...o }; delete c._id; delete c._updated; return c; }
const calls = [];

function handle(name, p) {
  if (name === 'hb_check') return { body: p.p_key === KEY };
  if (p.p_key !== KEY) return { status: 403, body: { code: '42501', message: 'hb_forbidden' } };
  const log = (action, summary) => db.activity.unshift({ at: new Date().toISOString(), action, summary });
  const live = () => db.projects.filter((x) => !x.deleted);
  switch (name) {
    case 'hb_check': return { body: true };
    case 'hb_load': return {
      body: {
        settings: db.settings,
        projects: live().map((x) => ({
          project: { ...x.data, _id: x.id },
          opinions: x.opinions.filter((o) => !o.deleted).map((o) => ({ ...o.data, _id: o.id }))
        })),
        trash: db.projects.filter((x) => x.deleted).map((x) => ({ _id: x.id, name: x.data['שם היזם'], address: x.data['כתובת הפרויקט'], deleted_at: x.deleted })),
        activity: db.activity.slice(0, 30),
        notes: db.notes.filter((n) => !n.deleted).map((n) => ({ ...n }))
      }
    };
    case 'hb_upsert_project': {
      if (!p.p_id) { const id = randomUUID(); db.projects.push({ id, deleted: null, data: strip(p.p_data), opinions: [] }); log('project_add', p.p_data['שם היזם']); return { body: id }; }
      const x = db.projects.find((y) => y.id === p.p_id); x.data = strip(p.p_data); log('project_edit', x.data['שם היזם']); return { body: x.id };
    }
    case 'hb_remove_project': { const x = db.projects.find((y) => y.id === p.p_id); x.deleted = new Date().toISOString(); log('project_delete', x.data['שם היזם']); return { body: null }; }
    case 'hb_restore_project': { const x = db.projects.find((y) => y.id === p.p_id); x.deleted = null; log('project_restore', x.data['שם היזם']); return { body: null }; }
    case 'hb_upsert_opinion': {
      const x = db.projects.find((y) => y.id === p.p_project);
      if (!p.p_id) { const id = randomUUID(); x.opinions.push({ id, deleted: null, data: strip(p.p_data) }); log('opinion_add', x.data['שם היזם']); return { body: id }; }
      const o = x.opinions.find((y) => y.id === p.p_id); o.data = strip(p.p_data); log('opinion_edit', x.data['שם היזם']); return { body: o.id };
    }
    case 'hb_remove_opinion': { db.projects.forEach((x) => x.opinions.forEach((o) => { if (o.id === p.p_id) o.deleted = 'now'; })); log('opinion_delete', ''); return { body: null }; }
    case 'hb_upsert_note': {
      const d = p.p_data;
      if (!p.p_id) { const n = { _id: randomUUID(), project_id: d.project_id || null, kind: d.kind || 'note', body: d.body, author: d.author, done: !!d.done, due: d.due || null, meta: d.meta || {}, created_at: new Date().toISOString() }; db.notes.unshift(n); log('note_add', d.body); return { body: n._id }; }
      const n = db.notes.find((x) => x._id === p.p_id); Object.assign(n, { project_id: d.project_id || null, kind: d.kind, body: d.body, author: d.author, done: !!d.done, due: d.due || null, meta: d.meta || n.meta }); return { body: n._id };
    }
    case 'hb_remove_note': { const n = db.notes.find((x) => x._id === p.p_id); n.deleted = true; return { body: null }; }
    case 'hb_save_settings': db.settings = p.p_settings; return { body: null };
    case 'hb_replace_all': {
      live().forEach((x) => { x.deleted = new Date().toISOString(); });
      p.p_projects.forEach((e) => db.projects.push({ id: randomUUID(), deleted: null, data: strip(e.project), opinions: e.opinions.map((o) => ({ id: randomUUID(), deleted: null, data: strip(o) })) }));
      log('import', p.p_projects.length + ' פרויקטים'); return { body: p.p_projects.length };
    }
    default: return { status: 404, body: { message: 'unknown rpc' } };
  }
}

// ---------- Harness ----------
let failures = 0; let passes = 0;
function ok(cond, msg) { if (cond) { passes++; console.log('  ✓ ' + msg); } else { failures++; console.log('  ✗ ' + msg); } }
const lastCall = (name) => [...calls].reverse().find((c) => c.name === name);
const countCalls = (name) => calls.filter((c) => c.name === name).length;

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4173', '--strictPort'], { stdio: 'pipe' });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview did not start')), 20000);
  server.stdout.on('data', (d) => { if (String(d).includes('4173')) { clearTimeout(t); res(); } });
});

const exe = existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;
const browser = await chromium.launch({ executablePath: exe });

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, locale: 'he-IL', acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => { failures++; console.log('  ✗ page error: ' + e.message); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const name = route.request().url().split('/rpc/')[1].split('?')[0];
    const params = route.request().postDataJSON() || {};
    calls.push({ name, params });
    const { status = 200, body } = handle(name, params);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return { context, page };
}

async function noHorizontalScroll(page, label) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  ok(sw <= iw, `${label}: no horizontal scroll (${sw} ≤ ${iw})`);
}

try {
  // ===== Desktop =====
  console.log('\nDesktop 1440');
  const { page } = await newPage({ width: 1440, height: 900 });
  await page.goto(BASE);

  console.log('Gate');
  ok(await page.isVisible('.gate-help >> text=קישור הכניסה האישי'), 'gate explains how to get in');
  await page.fill('.input-code', 'HB-WRONG-CODE');
  await page.click('text=כניסה');
  await page.waitForSelector('.gate-msg-wrong');
  ok(lastCall('hb_check').params.p_key === 'HB-WRONG-CODE', 'wrong code sent to hb_check');
  await page.screenshot({ path: `${SHOTS}/01-gate.png` });
  await page.fill('.input-code', KEY.toLowerCase());
  await page.click('text=כניסה');
  await page.waitForSelector('.table-projects .row');
  ok(lastCall('hb_check').params.p_key === KEY, 'code normalized to upper case');

  console.log('Overview & table');
  ok((await page.locator('.table-projects .row').count()) === 37, '37 project rows');
  ok((await page.locator('.tile').count()) === 5, '5 KPI tiles');
  ok(await page.isVisible('.table-head-line .legend >> text=בנצ\'מרק 15%'), 'benchmark legend next to table');
  ok((await page.locator('.table-projects .project-name').count()) === 37, 'project name shown in bold column');
  ok(await page.isVisible('.waiting-card .waiting-who'), 'waiting cards show who it waits on');
  const waitDays = await page.textContent('.waiting-card .waiting-days');
  ok(/שנ|חודש|ימים|יום/.test(waitDays), `waiting duration in years/months/days: ${waitDays}`);
  ok((await page.locator('.table-projects .follow').count()) >= 1, 'follow-up column filled');
  await page.screenshot({ path: `${SHOTS}/02-home.png` });

  console.log('Waiting → reminder mail');
  await page.locator('.waiting-card button:has-text("מייל תזכורת")').first().click();
  await page.waitForSelector('.mail-form');
  const subj = await page.inputValue('.mail-form input[aria-label="נושא"]');
  ok(subj.startsWith('תזכורת'), `reminder draft subject: ${subj}`);
  ok((await page.inputValue('.mail-form textarea')).includes('ממתינה'), 'reminder body mentions wait time');
  await page.fill('.mail-form input[aria-label="נמען"]', 'saul@example.org');
  ok(await page.isVisible('.mail-form .check'), 'offers to save the address to contacts');
  const gmail = await page.getAttribute('.modal a:has-text("Gmail")', 'href');
  ok(gmail.startsWith('https://mail.google.com/mail/?view=cm') && gmail.includes('saul%40example.org'), 'Gmail compose link carries the edited draft');
  await page.screenshot({ path: `${SHOTS}/03-mail.png` });
  await page.evaluate(() => { document.querySelectorAll('.modal a[target=_blank]').forEach((a) => a.removeAttribute('href')); });
  await page.click('.modal a:has-text("Gmail")');
  await page.waitForSelector('.mail-form', { state: 'detached' });
  ok((lastCall('hb_save_settings')?.params.p_settings.contacts || []).some((c) => c.email === 'saul@example.org'), 'address saved to contacts');
  const sent = lastCall('hb_upsert_note').params.p_data;
  ok(sent.kind === 'mail_out' && sent.project_id && sent.meta.subject.startsWith('תזכורת') && sent.meta.to === 'saul@example.org', 'sent mail filed to the project with date, subject and recipient');
  ok(await page.isVisible('a.btn-claude[href^="https://claude.ai/code/"]'), 'Claude Code button in header');
  ok(await page.evaluate(() => !!document.querySelector('link[rel=manifest]')), 'installable app manifest linked');
  ok(!(await page.isVisible('.chrome-banner')), 'no Chrome banner inside Chrome');

  console.log('Keyword search, chips, sort, group');
  await page.fill('input[type=search]', 'דימרי');
  await page.waitForTimeout(350);
  ok((await page.locator('.table-projects .row').count()) === 2, 'keyword "דימרי" → 2 rows');
  await page.fill('input[type=search]', 'אביסרור הרצל');
  await page.waitForTimeout(350);
  const multi = await page.locator('.table-projects .row').count();
  ok(multi >= 1 && multi < 6, `two keywords narrow results (${multi})`);
  await page.fill('input[type=search]', '');
  await page.waitForTimeout(350);
  await page.click('.chip-btn:has-text("מעל הבנצ")');
  const above = await page.locator('.table-projects .row').count();
  ok(above > 0 && above < 37, `chip "above benchmark" filters (${above})`);
  await page.click('.chip-btn:has-text("מעל הבנצ")');
  await page.click('.th-btn:has-text("רווחיות אחרונה")');
  ok(await page.isVisible('.th-btn.sorted:has-text("רווחיות אחרונה") >> text=▲'), 'sorted header highlighted with arrow');
  ok((await page.locator('td.td-sorted').count()) >= 37, 'sorted column cells highlighted');
  await page.click('.th-btn:has-text("רווחיות אחרונה")');
  ok(await page.isVisible('.th-btn.sorted >> text=▼'), 'second click sorts descending');
  ok((await page.textContent('.table-head-line')).includes('מהגדול לקטן'), 'sort order explained in words');
  await page.click('.th-btn:has-text("רווחיות אחרונה")');
  ok((await page.locator('.th-btn.sorted').count()) === 0, 'third click clears sort');
  const groupOpts = await page.locator('select[aria-label=קיבוץ] option').count();
  ok(groupOpts >= 12, `group by any column (${groupOpts} options)`);
  for (const v of ['שם היזם', '__follow', '__profit', '__cityAppraiser', '__year']) {
    await page.selectOption('select[aria-label=קיבוץ]', v);
    ok((await page.locator('.group-row').count()) >= 2, `grouping by ${v}`);
  }
  await page.selectOption('select[aria-label=קיבוץ]', '');

  console.log('Expand row');
  await page.locator('.table-projects .row').nth(3).locator('td').nth(2).click();
  await page.waitForSelector('.timeline-item');
  ok(await page.isVisible('.timeline-item >> text=שמאי יזם:'), 'names prefixed with role');
  ok(await page.isVisible('.timeline-item .pair >> text=עירייה'), 'both sides shown for profit');
  await page.locator('.table-projects .row').nth(3).locator('td').nth(2).click();

  console.log('Inline row edit & delete + undo');
  const row0 = page.locator('.table-projects .row').first();
  await row0.locator('button:has-text("ערוך")').click();
  await row0.locator('input[aria-label="רובע"]').fill('יב');
  await row0.locator('select').selectOption('בטיפול');
  await row0.locator('button:has-text("שמור")').click();
  await page.waitForSelector('.table-projects .row-edit', { state: 'detached' });
  const up = lastCall('hb_upsert_project').params;
  ok(up.p_id && up.p_data['רובע'] === 'יב' && up.p_data['סטטוס רמזור'] === 'בטיפול', 'inline edit saves');
  await page.locator('.table-projects .row').nth(1).locator('button:has-text("מחק")').click();
  await page.click('[data-testid=confirm-yes]');
  await page.waitForSelector('.toast-action');
  ok((await page.locator('.table-projects .row').count()) === 36, 'row removed');
  await page.click('.toast-action');
  await page.waitForFunction(() => document.querySelectorAll('.table-projects .row').length === 37);
  ok(lastCall('hb_restore_project').params.p_id === lastCall('hb_remove_project').params.p_id, 'undo restores');

  console.log('New project → card');
  await page.click('button:has-text("פרויקט חדש")');
  await page.fill('.modal .field:has-text("שם היזם") input', 'יזם בדיקה');
  await page.fill('.modal .field:has-text("שם התכנית") input', 'תכנית בדיקה');
  await page.fill('.modal .field:has-text("כתובת הפרויקט") input', 'רחוב הבדיקה 1');
  await page.click('.modal button:has-text("שמור פרויקט")');
  await page.waitForSelector('.page-detail');
  const np = lastCall('hb_upsert_project').params;
  ok(np.p_id === null && np.p_data['שם התכנית'] === 'תכנית בדיקה', 'new project payload');
  ok((await page.textContent('h1')).includes('תכנית בדיקה'), 'card title is the project name');

  console.log('Card: edit bar');
  await page.click('button:has-text("עריכת פרטים")');
  await page.waitForSelector('.editbar');
  await page.fill('.fact input[aria-label="קישור"]', 'https://example.org/plan');
  await page.click('.editbar button:has-text("שמור שינויים")');
  await page.waitForSelector('.editbar', { state: 'detached' });
  ok(lastCall('hb_upsert_project').params.p_data['קישור'] === 'https://example.org/plan', 'project fields saved');

  console.log('Card: opinions');
  await page.click('button:has-text("חוות דעת חדשה")');
  await page.fill('.opinion-new input[aria-label="שמאי יזם"]', 'שמאי א');
  await page.fill('.opinion-new input[aria-label="שמאי עירייה"]', 'שמאי ב');
  await page.fill('.opinion-new input[aria-label="תאריך בקשה"]', '01/01/2024');
  await page.fill('.opinion-new input[aria-label="רווחיות יזם"]', '18%');
  await page.fill('.opinion-new input[aria-label="רווחיות עירייה"]', '14.5%');
  await page.selectOption('.opinion-new select[aria-label="ממתין ל"]', 'שמאי העירייה');
  ok((await page.textContent('.opinion-new .pair')).includes('+3.5'), 'live gap preview');
  await page.fill('.opinion-new textarea', 'התקבלה בקשה');
  await page.click('.opinion-new button:has-text("שמור חוות דעת")');
  await page.waitForSelector('.opinion-new', { state: 'detached' });
  const no = lastCall('hb_upsert_opinion').params;
  ok(no.p_id === null && no.p_data['ממתין ל'] === 'שמאי העירייה' && /^\d\d\/\d\d\/\d{4}: התקבלה בקשה$/.test(no.p_data['הערות / סטטוס']), 'new opinion saved with follow-up and stamped note');
  ok(Object.keys(no.p_data).length === 14, 'opinion payload carries all 14 fields');
  ok(await page.isVisible('.opinion-card >> text=שמאי יזם:'), 'opinion card prefixes roles');
  ok(await page.isVisible('.panel-follow.is-open >> text=ממתין לשמאי העירייה: שמאי ב'), 'card follow-up panel names the appraiser');
  ok(/שנ|חודש/.test(await page.textContent('.follow-line')), 'follow-up duration in years/months');
  await page.click('.opinion-card button:has-text("ערוך")');
  const ta = page.locator('.opinion-form textarea');
  await ta.fill((await ta.inputValue()) + ' המשך טיפול');
  await page.click('.opinion-form button:has-text("שמור חוות דעת")');
  await page.waitForSelector('.opinion-form', { state: 'detached' });
  ok(lastCall('hb_upsert_opinion').params.p_data['הערות / סטטוס'].split('\n').length === 2, 'appended note gets its own dated line');
  await page.selectOption('.panel-follow select', 'היזם');
  await page.waitForSelector('.panel-follow >> text=ממתין להיזם');
  ok(lastCall('hb_upsert_opinion').params.p_data['ממתין ל'] === 'היזם', 'follow-up party changed from card');

  console.log('Card: mails');
  await page.click('.mail-card:has-text("לאילנית")');
  await page.waitForSelector('.mail-form');
  ok((await page.inputValue('.mail-form input[aria-label="נמען"]')) === 'ilanit@example.org', 'Ilanit address prefilled');
  ok((await page.inputValue('.mail-form textarea')).includes('תכנית בדיקה'), 'new-project mail mentions project');
  await page.click('.modal button:has-text("ביטול")');
  await page.waitForSelector('.mail-form', { state: 'detached' });
  await page.click('.mail-card:has-text("השלמת פרטים")');
  await page.waitForSelector('.pick');
  const body1 = await page.inputValue('.mail-form textarea');
  ok(body1.includes('מספר יחידות קיימות'), 'missing-details mail lists missing fields');
  await page.locator('.pick .check').filter({ hasText: 'מספר יחידות קיימות' }).locator('input').uncheck();
  ok(!(await page.inputValue('.mail-form textarea')).includes('מספר יחידות קיימות'), 'unchecking a field removes it from the draft');
  ok((await page.getAttribute('.modal a:has-text("Outlook")', 'href')).startsWith('https://outlook.office.com/mail/deeplink/compose'), 'Outlook web option');
  await page.click('.modal button:has-text("ביטול")');
  await page.waitForSelector('.mail-form', { state: 'detached' });

  console.log('Card: project file notes');
  await page.fill('.composer textarea', 'לבקש מהיזם טבלת איזון מעודכנת');
  await page.click('.composer .seg-control button:has-text("לבקש")');
  await page.fill('.composer input[aria-label="כותב ההערה"]', 'אילנית');
  await page.click('.composer button:has-text("שמור הערה")');
  await page.waitForSelector('.ft >> text=טבלת איזון');
  const nn = lastCall('hb_upsert_note').params;
  const cardId = decodeURIComponent(page.url().split('#/p/')[1]);
  ok(nn.p_data.project_id === cardId && nn.p_data.kind === 'ask' && nn.p_data.author === 'אילנית', 'note filed to project with kind and author');
  ok(await page.isVisible('.file-timeline >> text=טבלת איזון'), 'note appears in full project timeline');
  ok(await page.isVisible('.file-timeline >> text=התקבלה בקשה'), 'opinion notes merged into project timeline');
  await page.click('button:has-text("תיוק מייל מתיבת הדואר")');
  await page.waitForSelector('textarea[aria-label="הדבקת המייל"]');
  await page.fill('textarea[aria-label="הדבקת המייל"]', 'From: שמאי א <a.appraiser@example.org>\nSent: Tuesday, March 4, 2025 10:12 AM\nTo: אילנית\nSubject: עדכון דוח כלכלי\n\nשלום, מצורף דוח מעודכן.');
  ok((await page.inputValue('input[aria-label="נושא המייל"]')) === 'עדכון דוח כלכלי', 'pasted mail: subject parsed');
  ok((await page.inputValue('input[aria-label="תאריך המייל"]')) === '2025-03-04', 'pasted mail: date parsed');
  ok((await page.inputValue('select[aria-label="תפקיד השולח"]')) === 'שמאי היזם', 'pasted mail: sender recognised as the developer appraiser');
  await page.click('.modal button:has-text("תייק מייל")');
  await page.waitForSelector('.modal', { state: 'detached' });
  const inMail = lastCall('hb_upsert_note').params.p_data;
  ok(inMail.kind === 'mail_in' && inMail.project_id === cardId && inMail.meta.date === '2025-03-04' && inMail.meta.external, 'incoming mail filed to project');
  ok(await page.isVisible('.ft-mail_in >> text=עדכון דוח כלכלי'), 'incoming mail on the project timeline');
  ok(await page.isVisible('.ft-legend >> text=מה מסמלות הנקודות'), 'timeline explains the dots');
  await page.click('.ft-key:has-text("מייל שהתקבל")');
  ok((await page.locator('.file-timeline .ft').count()) === 1, 'legend filters the timeline');
  await page.click('.ft-key:has-text("מייל שהתקבל")');
  await page.click('.file-tabs button:has-text("מיילים")');
  ok(await page.isVisible('.note-mail_in .mail-subject'), 'mail tab lists mails');
  await page.click('.file-tabs button:has-text("הערות ומשימות")');
  await page.click('.note .tick');
  await page.waitForSelector('.note-done');
  ok(lastCall('hb_upsert_note').params.p_data.done === true, 'task marked done');
  await page.screenshot({ path: `${SHOTS}/06-detail.png`, fullPage: true });

  await page.click('.opinion-card button:has-text("מחק")');
  await page.click('[data-testid=confirm-yes]');
  await page.waitForSelector('.opinion-card', { state: 'detached' });
  ok(!!lastCall('hb_remove_opinion'), 'opinion deleted');
  await page.click('button:has-text("מחיקת פרויקט")');
  await page.click('[data-testid=confirm-yes]');
  await page.waitForSelector('.table-projects');
  ok(lastCall('hb_remove_project').params.p_id === cardId, 'project deleted from its card');

  console.log('Settings');
  await page.click('button:has-text("הגדרות")');
  ok(await page.isVisible('.settings-block >> text=ממולאות בה אוטומטית'), 'settings explain what the fields do');
  await page.waitForSelector('.contact-row');
  ok((await page.locator('.contact-row input[aria-label="מייל איש קשר"]').first().inputValue()) === 'saul@example.org', 'saved contact listed');
  await page.click('.modal button:has-text("הוספת איש קשר")');
  await page.locator('.contact-row').last().locator('input[aria-label="שם איש קשר"]').fill('אייל דנינו');
  await page.locator('.contact-row').last().locator('select').selectOption('שמאי יזם');
  await page.locator('.contact-row').last().locator('input[aria-label="מייל איש קשר"]').fill('eyal@example.org');
  await page.click('.modal-actions button:has-text("שמור")');
  await page.waitForSelector('.modal', { state: 'detached' });
  ok(lastCall('hb_save_settings').params.p_settings.contacts.some((c) => c.name === 'אייל דנינו' && c.role === 'שמאי יזם'), 'contact saved');

  console.log('Analytics');
  await page.click('.nav-link:has-text("ניתוח")');
  await page.waitForSelector('.analysis-card');
  ok((await page.locator('.analysis-card').count()) === 5, '5 analyses');
  const titles = { gap: 'רווחיות לפי יזם', 'appraisers-dev': 'שמאים מטעם היזם', 'appraisers-city': 'שמאים מטעם העירייה', pairs: 'פער לפי זוג', turnaround: 'זמני טיפול' };
  for (const t of Object.keys(titles)) {
    await page.goto(`${BASE}/#/a/${t}`);
    await page.waitForFunction((title) => document.querySelectorAll('.main h1').length === 1 && document.querySelector('.main h1').textContent.includes(title), titles[t]);
    await page.waitForSelector('.chart-box canvas, .state-card');
    ok(await page.isVisible('.what-panel'), `${t}: explains what is shown`);
    const hasChart = await page.isVisible('.chart-box canvas');
    if (hasChart) {
      const sorts = await page.locator('.chart-toolbar .seg-control button').count();
      ok(sorts >= 4, `${t}: ${sorts} ways to order the chart`);
      for (let i = 1; i < sorts; i++) {
        await page.locator('.chart-toolbar .seg-control button').nth(i).click();
        await page.waitForTimeout(120);
      }
      await page.locator('.chart-toolbar .seg-control button').first().click();
    } else ok(t === 'appraisers-city' || t === 'pairs', `${t}: empty state (no city data yet)`);
    if (t === 'gap') {
      ok(await page.isVisible('.what-panel .legend'), 'gap: colour legend with benchmark');
      await page.locator('.detail-head').filter({ hasText: /([2-9]|\d\d) חוו״ד/ }).first().click();
      await page.waitForSelector('.detail-list li');
      const rowsTxt = await page.locator('.detail-list li').allTextContents();
      ok(rowsTxt.length >= 2 && rowsTxt.every((r) => /יזם/.test(r) && /עירייה/.test(r)), `drill-down lists projects by date with both sides (${rowsTxt.length})`);
      ok(/מגמה/.test(await page.textContent('.detail-open .detail-head')), 'developer row states trend');
      ok(/ממוצע רווחיות היזם בכל חוות הדעת שלו/.test(await page.textContent('.detail-open .detail-head')), 'average says what it averages');
      ok((await page.locator('.detail-open .detail-project').count()) >= 1, 'drill-down split by project');
      await page.click('.compare-btn');
      ok(await page.isVisible('.compare-hint >> text=חסר'), 'comparison mode explains missing city values');
      await page.waitForTimeout(900);
      await page.locator('.chart-panel').screenshot({ path: `${SHOTS}/08-compare.png` });
      await page.click('.compare-btn');
      const box = await page.locator('.chart-box canvas').boundingBox();
      await page.mouse.click(box.x + box.width - 90, box.y + 80);
      await page.waitForSelector('.focus-bar');
      ok(/מבודד/.test(await page.textContent('.focus-bar')), 'clicking a frame isolates the group');
      await page.waitForTimeout(900);
      await page.locator('.chart-panel').screenshot({ path: `${SHOTS}/08-focus.png` });
      await page.click('.focus-bar button');
      await page.waitForSelector('.focus-bar', { state: 'detached' });
      ok(true, 'back to the full chart');
      await page.click('.chart-toolbar button:has-text("לפי תאריך")');
      await page.waitForTimeout(900);
      await page.locator('.chart-panel').screenshot({ path: `${SHOTS}/08-date.png` });
      await page.click('.chart-toolbar .seg-control button >> nth=0');
      ok((await page.locator('.details .arrow-up').count()) + (await page.locator('.details .arrow-down').count()) > 0, 'arrows shown');
      const upColor = await page.evaluate(() => { const el = document.querySelector('.arrow-up'); return el ? getComputedStyle(el).color : ''; });
      ok(!upColor || upColor === 'rgb(180, 50, 42)', `up arrow is red (danger) ${upColor}`);
      await page.locator('.chart-panel').scrollIntoViewIfNeeded();
      await page.waitForTimeout(1200);
      await page.locator('.chart-panel').screenshot({ path: `${SHOTS}/08-gap-chart.png` });
      await page.locator('.chart-toolbar .seg-control button:has-text("לפי רובע")').click();
      await page.waitForTimeout(1200);
      await page.locator('.chart-panel').screenshot({ path: `${SHOTS}/08-gap-quarter.png` });
      await page.locator('.chart-toolbar .seg-control button').first().click();
    }
    if (t === 'turnaround') await page.screenshot({ path: `${SHOTS}/08-turnaround.png` });
  }

  console.log('Journal');
  await page.click('.nav-link:has-text("יומן")');
  await page.waitForSelector('.composer');
  await page.fill('.composer textarea', 'להזכיר לשמאי העירייה על דוח המחוז');
  await page.selectOption('.composer select[aria-label="תיוק לפרויקט"]', { index: 3 });
  await page.fill('.composer input[aria-label="תאריך יעד"]', '2026-11-01');
  await page.click('.composer button:has-text("שמור הערה")');
  await page.waitForSelector('.note >> text=דוח המחוז');
  const jn = lastCall('hb_upsert_note').params.p_data;
  ok(jn.project_id && jn.kind === 'todo' && jn.due === '2026-11-01', 'journal note filed to a project with due date');
  ok(await page.isVisible('.note >> .note-project'), 'journal shows the project it is filed to');
  await page.fill('.composer textarea', 'פגישת צוות שבועית');
  await page.click('.composer .seg-control button:has-text("לזכור")');
  await page.click('.composer button:has-text("שמור הערה")');
  await page.waitForSelector('.note >> text=פגישת צוות');
  ok(lastCall('hb_upsert_note').params.p_data.project_id === null, 'general note without project');
  await page.selectOption('select[aria-label="תיוק"]', 'general');
  await page.waitForFunction(() => document.querySelectorAll('.notes-list .note').length === 1, null, { timeout: 5000 }).catch(() => {});
  ok((await page.locator('.notes-list .note').count()) === 1, 'filter: general only');
  await page.selectOption('select[aria-label="תיוק"]', '');
  await page.locator('.note:has-text("פגישת צוות") button:has-text("מחק")').click();
  await page.click('[data-testid=confirm-yes]');
  await page.waitForSelector('.note >> text=פגישת צוות', { state: 'detached' });
  ok(!!lastCall('hb_remove_note'), 'note deleted');
  const trashCount = await page.locator('.trash li').count();
  await page.locator('.trash li button:has-text("שחזר")').first().click();
  await page.waitForFunction((n) => document.querySelectorAll('.trash li').length === n - 1, trashCount);
  ok(true, 'restore from trash');
  await page.screenshot({ path: `${SHOTS}/09-journal.png`, fullPage: true });

  console.log('Excel round trip');
  await page.click('.nav-link:has-text("פרויקטים")');
  await page.waitForSelector('.table-projects .row');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("ייצוא Excel")')]);
  const xlsxPath = `${SHOTS}/export.xlsx`;
  await dl.saveAs(xlsxPath);
  const before = await page.locator('.table-projects .row').count();
  await page.setInputFiles('[data-testid=import-file]', xlsxPath);
  await page.waitForSelector('[data-testid=confirm-yes]');
  await page.click('[data-testid=confirm-yes]');
  await page.waitForSelector('.toast-ok:has-text("יובאו")');
  ok(lastCall('hb_replace_all').params.p_projects.length === before, `round-trip import: ${before} projects`);

  console.log('Entry link');
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/?k=${KEY.toLowerCase()}#/a`);
  await page.waitForSelector('.analysis-card');
  ok(!page.url().includes('k='), 'code removed from address bar');
  await page.click('button:has-text("הגדרות")');
  ok((await page.inputValue('input[aria-label="קישור כניסה"]')) === `${BASE}/?k=${encodeURIComponent(KEY)}`, 'settings shows share link');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
  await page.evaluate(() => localStorage.setItem('hashbacha-access-key', 'HB-REVOKED'));
  await page.reload();
  await page.waitForSelector('.gate-card');
  ok(true, 'invalid stored code returns to gate');

  console.log('Other browser → Chrome banner');
  const edgeCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0' });
  const edge = await edgeCtx.newPage();
  await edge.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await edge.route('**/rest/v1/rpc/**', async (route) => { const name = route.request().url().split('/rpc/')[1]; const { status = 200, body } = handle(name, route.request().postDataJSON() || {}); await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); });
  await edge.goto(`${BASE}/?k=${KEY}`);
  await edge.waitForSelector('.chrome-banner');
  ok((await edge.textContent('.chrome-banner')).includes('Microsoft Edge'), 'banner names the current browser');
  const [launcher] = await Promise.all([edge.waitForEvent('download'), edge.click('.chrome-banner button:has-text("קיצור דרך")')]);
  const lp = `${SHOTS}/launcher.cmd`;
  await launcher.saveAs(lp);
  ok(readFileSync(lp, 'utf8').includes('start "" chrome "http://localhost:4173/?k=HB-TEST-TEST-TEST"'), 'Windows launcher opens the app in Chrome');
  await edgeCtx.close();

  // ===== Mobile =====
  console.log('\nMobile 390');
  const m = await newPage({ width: 390, height: 844 });
  await m.page.goto(`${BASE}/?k=${KEY}`);
  await m.page.waitForSelector('.table-projects .row');
  await m.page.waitForTimeout(900);
  await noHorizontalScroll(m.page, 'projects');
  await m.page.screenshot({ path: `${SHOTS}/m1-home.png` });
  await m.page.locator('.table-projects .row').nth(4).locator('td').nth(2).click();
  await m.page.waitForSelector('.timeline-item');
  await noHorizontalScroll(m.page, 'expanded row');
  await m.page.locator('.table-projects .row').nth(4).locator('a:has-text("פתח")').click();
  await m.page.waitForSelector('.page-detail');
  await m.page.waitForTimeout(900);
  await noHorizontalScroll(m.page, 'project card');
  await m.page.screenshot({ path: `${SHOTS}/m2-detail.png`, fullPage: true });
  await m.page.click('.mail-card:has-text("השלמת פרטים")');
  await m.page.waitForSelector('.mail-form');
  await noHorizontalScroll(m.page, 'mail composer');
  await m.page.click('.modal button:has-text("ביטול")');
  await m.page.click('button:has-text("חוות דעת חדשה")');
  await noHorizontalScroll(m.page, 'new opinion form');
  for (const path of ['#/a', '#/a/gap', '#/a/turnaround', '#/log']) {
    await m.page.goto(`${BASE}/${path}`);
    await m.page.waitForTimeout(900);
    await noHorizontalScroll(m.page, path);
  }
  await m.page.screenshot({ path: `${SHOTS}/m3-log.png`, fullPage: true });
  await m.page.click('button:has-text("הגדרות")');
  await noHorizontalScroll(m.page, 'settings modal');
  await m.page.click('button:has-text("יציאה מהמערכת")');
  await m.page.waitForSelector('.gate-card');
  ok(await m.page.evaluate(() => !localStorage.getItem('hashbacha-access-key')), 'logout clears the code');
} catch (e) {
  failures++;
  console.log('  ✗ crashed: ' + e.message.split('\n')[0]);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

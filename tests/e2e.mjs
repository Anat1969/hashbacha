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
  notes: [],
  reviews: [],
  role: 'editor'
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
        notes: db.notes.filter((n) => !n.deleted).map((n) => ({ ...n })),
        me: { role: db.role },
        reviews: db.reviews.filter((r) => !r.superseded_by).map((r) => ({
          _id: r._id, project_id: r.project_id, opinion_id: r.opinion_id, round: r.round, status: r.status, updated_at: r.updated_at,
          ok: Object.values(r.marks).filter((m) => m.verdict === 'ok').length, no: Object.values(r.marks).filter((m) => m.verdict === 'no').length,
          events: r.events.filter((e) => ['open', 'import', 'letter_sent', 'approve'].includes(e.kind))
        }))
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
    default: return reviewRpc(name, p);
  }
}

// Review RPCs: same status rules as the SQL functions.
// Required parameters per review RPC, as PostgREST matches them: a missing key → 404 PGRST202.
const REVIEW_REQUIRED = {
  hb_review_open: ['p_key', 'p_project', 'p_opinion'], hb_review_get: ['p_key', 'p_review'], hb_review_file: ['p_key', 'p_file'],
  hb_review_import: ['p_key', 'p_review', 'p_slot', 'p_file', 'p_parsed'], hb_review_set_ref: ['p_key', 'p_review', 'p_row', 'p_value', 'p_src'],
  hb_review_set_value: ['p_key', 'p_review', 'p_row', 'p_slot', 'p_value', 'p_note'], hb_review_mark: ['p_key', 'p_review', 'p_row', 'p_verdict', 'p_comment'],
  hb_review_status: ['p_key', 'p_review', 'p_status'], hb_review_new_round: ['p_key', 'p_review'], hb_review_approve: ['p_key', 'p_review']
};
function reviewRpc(name, p) {
  const missing = (REVIEW_REQUIRED[name] || []).filter((k) => !(k in p));
  if (missing.length) return { status: 404, body: { code: 'PGRST202', message: `Could not find the function public.${name} (missing ${missing.join(', ')})` } };
  const isWrite = name !== 'hb_review_get' && name !== 'hb_review_file';
  if (name.startsWith('hb_review_') && isWrite && db.role === 'viewer') return { status: 400, body: { code: 'P0001', message: 'hb_readonly' } };
  const rv = db.reviews.find((r) => r._id === p.p_review);
  const ev = (r, kind, detail) => { r.events.unshift({ at: new Date().toISOString(), actor: p.p_actor || '', kind, detail }); r.updated_at = new Date().toISOString(); };
  switch (name) {
    case 'hb_review_open': {
      const cur = db.reviews.find((r) => r.project_id === p.p_project && r.opinion_id === p.p_opinion && !r.superseded_by);
      if (cur) return { body: cur._id };
      const r = { _id: randomUUID(), project_id: p.p_project, opinion_id: p.p_opinion, round: 1, status: 'waiting_for_reports', levy_rate: 25, params: {}, marks: {}, events: [], files: [], superseded_by: null, updated_at: new Date().toISOString() };
      db.reviews.push(r); ev(r, 'open', {}); return { body: r._id };
    }
    case 'hb_review_get': {
      if (!rv) return { status: 400, body: { message: 'hb_not_found' } };
      return { body: { ...rv, id: rv._id, files: rv.files.filter((f) => !f.deleted).map(({ content_b64, ...f }) => f), rounds: db.reviews.filter((x) => x.project_id === rv.project_id && x.opinion_id === rv.opinion_id).map((x) => ({ _id: x._id, round: x.round, status: x.status })) } };
    }
    case 'hb_review_file': { const f = db.reviews.flatMap((r) => r.files).find((x) => x._id === p.p_file); return { body: { file_name: f.file_name, content_b64: f.content_b64 } }; }
    case 'hb_review_import': {
      for (let i = 1; i <= 22; i++) {
        const c = 'r' + i; const v = p.p_parsed[c] || {};
        rv.params[c] = { ...(rv.params[c] || {}), ...(p.p_slot === 'N' ? { N: v.v, ...(v.note ? { src: v.note } : {}) } : { [p.p_slot]: v.v, [p.p_slot + 'note']: v.note || '' }) };
      }
      rv.files.forEach((f) => { if (f.slot === p.p_slot) f.deleted = true; });
      if (p.p_file) rv.files.push({ _id: randomUUID(), slot: p.p_slot, file_name: p.p_file.name, size: p.p_file.size, meta: p.p_file.meta, content_b64: p.p_file.content_b64 });
      const other = p.p_slot === 'D' ? 'M' : 'D';
      if (p.p_slot !== 'N' && rv.status === 'waiting_for_reports' && rv.files.some((f) => !f.deleted && f.slot === other)) rv.status = 'reports_imported';
      ev(rv, 'import', { slot: p.p_slot, file: p.p_file?.name }); return { body: rv.status };
    }
    case 'hb_review_set_ref': rv.params[p.p_row] = { ...(rv.params[p.p_row] || {}), N: p.p_value, src: p.p_src }; ev(rv, 'ref', { row: p.p_row, N: p.p_value }); return { body: null };
    case 'hb_review_set_value': rv.params[p.p_row] = { ...(rv.params[p.p_row] || {}), [p.p_slot]: p.p_value }; ev(rv, 'ref', { row: p.p_row, slot: p.p_slot, value: p.p_value }); return { body: rv.status };
    case 'hb_review_mark':
      rv.marks[p.p_row] = { verdict: p.p_verdict, comment: p.p_comment, reviewer: p.p_actor, marked_at: new Date().toISOString() };
      if (['waiting_for_reports', 'reports_imported', 'revised_report_received'].includes(rv.status)) rv.status = 'in_review';
      ev(rv, 'mark', { row: p.p_row, verdict: p.p_verdict, comment: p.p_comment }); return { body: rv.status };
    case 'hb_review_status':
      if (p.p_status === 'letter_draft') { ev(rv, 'letter_draft', p.p_note); return { body: rv.status }; }
      rv.status = 'instructions_sent'; ev(rv, 'letter_sent', p.p_note); return { body: rv.status };
    case 'hb_review_approve':
      if (Object.values(rv.marks).filter((m) => m.verdict === 'ok').length < 22) return { status: 400, body: { message: 'hb_not_all_ok' } };
      rv.status = 'approved'; ev(rv, 'approve', {}); return { body: null };
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
  const context = await browser.newContext({ viewport, locale: 'he-IL', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  context.on('page', (p) => { if (p !== page) p.close().catch(() => {}); }); // compose windows opened by the app
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
  const notesBefore = countCalls('hb_upsert_note');
  await page.click('.modal a:has-text("Gmail")');
  await page.waitForSelector('.mail-confirm');
  ok(countCalls('hb_upsert_note') === notesBefore, 'opening Gmail files nothing yet');
  ok((await page.textContent('.mail-confirm')).includes('Gmail'), 'composer asks whether the mail was sent');
  await page.click('.modal button:has-text("נשלח, לתייק")');
  await page.waitForSelector('.mail-form', { state: 'detached' });
  ok((lastCall('hb_save_settings')?.params.p_settings.contacts || []).some((c) => c.email === 'saul@example.org'), 'address saved to contacts');
  const sent = lastCall('hb_upsert_note').params.p_data;
  ok(sent.kind === 'mail_out' && sent.project_id && sent.meta.subject.startsWith('תזכורת') && sent.meta.to === 'saul@example.org', 'sent mail filed to the project with date, subject and recipient');
  ok((await page.locator('.topbar a.btn-claude, .topbar button:has-text("התקנה כאפליקציה")').count()) === 0, 'header has no install / Claude buttons');
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
  const notesBefore2 = countCalls('hb_upsert_note');
  await page.evaluate(() => { document.querySelectorAll('.modal a[target=_blank]').forEach((a) => a.removeAttribute('href')); });
  await page.click('.modal a:has-text("Outlook")');
  await page.waitForSelector('.mail-confirm');
  await page.click('.modal button:has-text("לא נשלח, חזרה לעריכה")');
  await page.waitForSelector('.modal a:has-text("Gmail")');
  ok(countCalls('hb_upsert_note') === notesBefore2, '"לא נשלח" files nothing and returns to the draft');
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
  await page.fill('.modal input[placeholder^="https://claude.ai"]', 'https://claude.ai/project/research-test');
  await page.click('.modal-actions button:has-text("שמור")');
  await page.waitForSelector('.modal', { state: 'detached' });
  ok(lastCall('hb_save_settings').params.p_settings.contacts.some((c) => c.name === 'אייל דנינו' && c.role === 'שמאי יזם'), 'contact saved');
  ok(lastCall('hb_save_settings').params.p_settings.researchUrl === 'https://claude.ai/project/research-test', 'Claude research project link saved');
  await page.click('button:has-text("הגדרות")');
  ok(await page.isVisible('.modal a.btn-claude[href^="https://claude.ai/code/"]'), 'Settings: "עריכה ושדרוג ב־Claude"');
  ok((await page.locator('.modal .install-status, .modal button:has-text("התקנה כאפליקציה")').count()) === 1, 'Settings: install-in-Chrome button or how-to');
  ok((await page.getAttribute('.modal a:has-text("פתיחת פרויקט המחקר ב־Claude")', 'href')) === 'https://claude.ai/project/research-test', 'Settings opens the Claude research project');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });

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

  console.log('Guide');
  await page.goto(`${BASE}/?k=${KEY}#/guide`);
  await page.waitForSelector('.guide-section');
  ok(await page.isVisible('.nav-link.active:has-text("מדריך")'), 'main menu has "מדריך"');
  for (const t of ['חזון ומטרה', 'המסלול בשישה צעדים', 'קלט ופלט', 'הלוגיקה של בקרת השומה', 'איך מתבצעת התקשורת', 'מי עושה מה', 'איך הכול מתחבר', 'צעדים ראשונים']) {
    ok(await page.isVisible(`.guide-section h2:has-text("${t}")`), `guide section: ${t}`);
  }
  ok((await page.locator('.guide-flow li').count()) === 6, 'guide: six-step flow');
  await page.click('.guide-toc button:has-text("מי עושה מה")');
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => document.getElementById('guide-roles').getBoundingClientRect().top < 300), 'table of contents scrolls to the section');
  await page.screenshot({ path: `${SHOTS}/g1-guide.png`, fullPage: true });
  const anon = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'he-IL' });
  const ap = await anon.newPage();
  await ap.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ap.goto(BASE);
  await ap.waitForSelector('.gate-card');
  await ap.click('.gate-help a:has-text("מדריך למשתמש")');
  await ap.waitForSelector('.guide-section');
  ok(await ap.isVisible('a.guide-enter'), 'guide opens without a code from the entry screen');
  await anon.close();

  // ===== Appraisal review module =====
  console.log('Review: top-level overview');
  await page.goto(`${BASE}/?k=${KEY}#/s`);
  await page.waitForSelector('.table-reviews');
  ok(await page.isVisible('.nav-link.active:has-text("בקרת שומות")'), 'main menu has "בקרת שומות"');
  ok((await page.locator('.table-reviews tr.row').count()) > 0, 'overview lists opinions with their review status');
  await page.screenshot({ path: `${SHOTS}/r0-reviews-overview.png`, fullPage: true });

  console.log('Review: list column, button, tab');
  await page.goto(`${BASE}/?k=${KEY}#/`);
  await page.waitForSelector('.table-projects .row');
  ok(await page.isVisible('.th-btn:has-text("בקרת שומה")'), 'review status column in the project list');
  const withOps = page.locator('.table-projects .row').filter({ has: page.locator('td[data-label="חוו״ד"]:not(:text-is("0"))') }).first();
  const projName = (await withOps.locator('.project-name').textContent()).trim();
  await withOps.locator('a:has-text("בקרת שומת השבחה")').click();
  await page.waitForSelector('.detail-tabs a.on:has-text("שומות השבחה")');
  ok(/#\/p\/[^/]+\/r$/.test(page.url()), 'list button opens the review tab of that project');
  ok((await page.textContent('.project-title')).trim() === projName, 'same project page, new tab');
  await page.screenshot({ path: `${SHOTS}/r1-review-tab.png`, fullPage: true });
  await page.click('.detail-tabs a:has-text("פרויקט ומעקב")');
  await page.waitForSelector('.panel-follow');
  ok(await page.isVisible('h2:has-text("חוות דעת")'), 'project tab still shows the original card');
  await page.click('.detail-tabs a:has-text("שומות השבחה")');
  await page.waitForSelector('.review-card');

  console.log('Review: open, import, mark, letter');
  await page.locator('.review-card button:has-text("פתיחת בקרה")').first().click();
  await page.waitForSelector('.table-review');
  const openCall = lastCall('hb_review_open').params;
  ok(openCall.p_project && openCall.p_opinion && openCall.p_key === KEY, 'open sends project + opinion');
  ok((await page.locator('.table-review tr.row').count()) === 22, '22 parameter rows');
  ok((await page.locator('.table-review .group-row').count()) === 7, '7 chapter rows');
  await page.fill('input[aria-label="שם הבודק"]', 'ענת');
  for (const [i, f] of [[0, 'sample-developer'], [1, 'sample-municipality'], [2, 'sample-reference']]) {
    const chooser = page.waitForEvent('filechooser');
    await page.locator('.review-slot .mail-card').nth(i).click();
    await (await chooser).setFiles(`docs/hashbacha/templates/${f}.xlsx`);
    await page.waitForSelector('.import-msg');
    await page.waitForTimeout(300);
    const msg = await page.textContent('.import-msg');
    ok(msg.includes('22 מתוך 22'), `${f}: all 22 fields imported`);
    if (f === 'sample-municipality') ok(msg.includes('ולכן הוא נקלט במשבצת שמאי העירייה'), 'file routed by "סוג דוח" even when dropped on another slot');
    await page.click('.import-msg button:has-text("סגירה")');
  }
  ok((await page.locator('.review-slot .link-btn:has-text("הורדת הקובץ")').count()) === 3, 'three original files stored with the review');
  ok((await page.locator('.review-slot .mail-card b').allTextContents()).join('|') === 'שמאי היזם|ייחוס (לא חובה)|שמאי העירייה', 'slots ordered developer | reference | municipality');
  ok((await page.locator('.table-review thead th').allTextContents()).slice(0, 5).join('|') === 'פרמטר|שמאי היזם|ייחוס ומקור|שמאי העירייה|טווח קביל', 'table columns: parameter | developer | reference | municipality | tolerance');
  ok(await page.isVisible('tr[data-row="r18"] td.col-ref >> text=נוהג שוק'), 'reference column shows the source');
  const imp = calls.filter((c) => c.name === 'hb_review_import').map((c) => c.params);
  ok(calls.filter((c) => /^hb_review_(import|get|mark|set_ref)$/.test(c.name)).every((c) => typeof c.params.p_review === 'string' && c.params.p_review.length > 10), 'every review call sends p_review');
  ok(imp.map((c) => c.p_slot).join() === 'D,M,N', 'imports go to slots D, M, N');
  ok(typeof imp[0].p_parsed.r5.v === 'number' && imp[0].p_file.content_b64.length > 100 && imp[0].p_actor === 'ענת', 'import payload: parsed values, file, reviewer name');
  ok(await page.isVisible('.detail-badges .pill:has-text("הדוחות נקלטו")'), 'status: reports imported');
  ok((await page.locator('.table-review .side-good').count()) > 0 && (await page.locator('.table-review .side-bad').count()) > 0, 'rows coloured green / red');
  const r1 = page.locator('tr[data-row="r1"]');
  await r1.locator('button.mark-ok').click();
  await page.waitForSelector('tr[data-row="r1"] button.mark-ok.on');
  ok(lastCall('hb_review_mark').params.p_row === 'r1' && lastCall('hb_review_mark').params.p_verdict === 'ok', '✓ sends row + verdict');
  const r5 = page.locator('tr[data-row="r5"]');
  await r5.locator('textarea').fill('נדרש מקור לעסקאות');
  await r5.locator('button.mark-no').click();
  await page.waitForSelector('tr[data-row="r5"] button.mark-no.on');
  ok(lastCall('hb_review_mark').params.p_comment === 'נדרש מקור לעסקאות', '✗ sends the comment');
  ok(await page.isVisible('.detail-badges .pill:has-text("בבדיקה")'), 'status: in review after first mark');
  await page.click('button:has-text("עריכת נתונים")');
  await page.fill('input[aria-label="עירייה שיעור היוון"]', '6.25');
  await page.fill('input[aria-label="מקור רווח יזמי"]', 'נוהג שוק 2026');
  await page.click('.editbar button:has-text("שמור נתונים")');
  await page.waitForSelector('.editbar', { state: 'detached' });
  ok(lastCall('hb_review_set_ref').params.p_row === 'r18' && lastCall('hb_review_set_ref').params.p_src === 'נוהג שוק 2026', 'reference edit saves row + source');
  ok(lastCall('hb_review_set_value').params.p_row === 'r20' && lastCall('hb_review_set_value').params.p_slot === 'M' && lastCall('hb_review_set_value').params.p_value === 6.25, 'manual correction of the city report value');
  ok((await page.getAttribute('a:has-text("הורדת תבנית ריקה")', 'href')) === '/templates/template.xlsx', 'blank template download link');
  ok((await page.locator('a:has-text("פרויקט המחקר ב־Claude")').count()) === 0, 'research link is not on the review pages (Settings only)');
  ok((await page.textContent('.review-facts')).includes('שמאי היזם (בדוי)'), 'appraiser names from the imported files');
  ok(await page.isDisabled('button:has-text("אישור הבקרה")'), 'approve disabled until all 22 rows are ✓');
  await page.screenshot({ path: `${SHOTS}/r2-review-compare.png`, fullPage: true });
  await page.click('button:has-text("מכתב הוראות (1)")');
  await page.waitForSelector('.mail-form');
  const letter = await page.inputValue('textarea[aria-label="תוכן המייל"]');
  ok(letter.includes('שווי דירה קיימת') && letter.includes('נדרש מקור לעסקאות'), 'letter lists the ✗ row with the comment');
  await page.screenshot({ path: `${SHOTS}/r3-letter.png` });
  const statusBefore = countCalls('hb_review_status');
  const gmailHrefLetter = await page.getAttribute('.modal a:has-text("Gmail")', 'href');
  const outlookHrefLetter = await page.getAttribute('.modal a:has-text("Outlook")', 'href');
  ok(gmailHrefLetter.length <= 6000 && outlookHrefLetter.length <= 1500, `letter links fit the services (Gmail ${gmailHrefLetter.length}, Outlook ${outlookHrefLetter.length})`);
  await page.click('.modal a:has-text("Outlook")');
  await page.waitForSelector('.mail-confirm');
  if (outlookHrefLetter.includes(encodeURIComponent('Ctrl+V'))) {
    ok((await page.evaluate(() => navigator.clipboard.readText())) === letter, 'long letter: full text copied for pasting');
  }
  ok(countCalls('hb_review_status') === statusBefore, 'opening the letter does not mark it sent');
  await page.click('.modal button:has-text("נשלח, לתייק")');
  await page.waitForSelector('.detail-badges .pill:has-text("הוראות נשלחו")');
  ok(lastCall('hb_review_status').params.p_status === 'instructions_sent' && lastCall('hb_review_status').params.p_note.via === 'outlook', 'confirmed letter → instructions_sent');
  ok(lastCall('hb_upsert_note').params.p_data.kind === 'mail_out' && lastCall('hb_upsert_note').params.p_data.meta.via === 'outlook', 'letter filed as mail out only after confirmation');
  ok(await page.isVisible('.file-timeline >> text=מכתב הוראות נשלח'), 'review log shows the letter');
  await page.click('.detail-tabs a:has-text("פרויקט ומעקב")');
  await page.waitForSelector('.ft-key:has-text("בקרת שומה")');
  ok(await page.isVisible('.file-timeline >> text=נשלח מכתב הוראות'), 'project timeline includes review events');
  console.log('Review: approve and update the opinion');
  await page.click('.detail-tabs a:has-text("שומות השבחה")');
  await page.click('.review-card a:has-text("פתיחת ההשוואה")');
  await page.waitForSelector('.table-review');
  for (let i = 1; i <= 22; i++) {
    const btn = page.locator(`tr[data-row="r${i}"] button.mark-ok`);
    if (!(await btn.evaluate((el) => el.classList.contains('on')))) { await btn.click(); await page.waitForSelector(`tr[data-row="r${i}"] button.mark-ok.on`); }
  }
  await page.click('button:has-text("אישור הבקרה")');
  await page.click('[data-testid=confirm-yes]');
  await page.waitForSelector('.detail-badges .pill:has-text("אושר")');
  ok(lastCall('hb_review_approve').params.p_review, 'approve sent when all 22 rows are ✓');
  await page.click('button:has-text("עדכון רווחיות בחוות הדעת")');
  await page.click('[data-testid=confirm-yes]');
  await page.waitForTimeout(400);
  const upd = lastCall('hb_upsert_opinion').params.p_data;
  ok(/%$/.test(upd['רווחיות יזם (%)']) && /%$/.test(upd['רווחיות עירייה (%)']), `opinion updated from r18: ${upd['רווחיות יזם (%)']} / ${upd['רווחיות עירייה (%)']}`);
  ok(await page.locator('tr[data-row="r1"] button.mark-ok').isDisabled(), 'approved review is locked');
  await page.goto(`${BASE}/#/`);
  await page.waitForSelector('.table-projects .row');
  ok(await page.isVisible('.table-projects .pill:has-text("אושר")'), 'list badge shows the review status');
  await page.click('.nav-link:has-text("בקרת שומות")');
  await page.waitForSelector('.table-reviews');
  await page.click('.chip-btn:has-text("אושרו")');
  ok((await page.locator('.table-reviews tr.row').count()) === 1, 'overview filter: the approved review');
  await page.click('.table-reviews a:has-text("פתיחת ההשוואה")');
  await page.waitForSelector('.table-review');
  ok(/#\/p\/[^/]+\/r\/[^/]+$/.test(page.url()), 'overview opens the comparison inside the project card');

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
  const rid = db.reviews[0]._id; const rpid = db.reviews[0].project_id;
  await m.page.goto(`${BASE}/#/p/${rpid}/r/${rid}`);
  await m.page.waitForSelector('.table-review');
  await m.page.waitForTimeout(900);
  await noHorizontalScroll(m.page, 'review comparison');
  await m.page.screenshot({ path: `${SHOTS}/m-review.png`, fullPage: true });
  await m.page.goto(`${BASE}/#/p/${rpid}/r`);
  await m.page.waitForSelector('.review-card');
  await noHorizontalScroll(m.page, 'review tab');
  db.role = 'viewer';
  await m.page.goto(`${BASE}/#/p/${rpid}/r/${rid}`);
  await m.page.reload();
  await m.page.waitForSelector('.table-review');
  ok(await m.page.locator('.table-review button.mark-ok').first().isDisabled(), 'viewer code: marking disabled');
  ok(await m.page.isVisible('.role-pill:has-text("צפייה בלבד")'), 'viewer code: header says view only');
  await noHorizontalScroll(m.page, 'viewer header');
  db.role = 'editor';
  await m.page.goto(`${BASE}/#/p/${rpid}`);
  await m.page.reload();
  await m.page.waitForSelector('.page-detail');
  await m.page.screenshot({ path: `${SHOTS}/m2-detail.png`, fullPage: true });
  await m.page.click('.mail-card:has-text("השלמת פרטים")');
  await m.page.waitForSelector('.mail-form');
  await noHorizontalScroll(m.page, 'mail composer');
  await m.page.click('.modal button:has-text("ביטול")');
  await m.page.click('button:has-text("חוות דעת חדשה")');
  await noHorizontalScroll(m.page, 'new opinion form');
  for (const path of ['#/s', '#/guide', '#/a', '#/a/gap', '#/a/turnaround', '#/log']) {
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
  console.log('  ✗ crashed: ' + e.message.split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

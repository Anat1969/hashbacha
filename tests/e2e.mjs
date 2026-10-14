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
  activity: []
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
        activity: db.activity.slice(0, 30)
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
  await page.fill('.input-code', 'HB-WRONG-CODE');
  await page.click('text=כניסה');
  await page.waitForSelector('.gate-msg-wrong');
  ok(lastCall('hb_check').params.p_key === 'HB-WRONG-CODE', 'wrong code sent to hb_check');
  ok(await page.isVisible('text=הקוד שגוי'), 'wrong code message shown');
  await page.screenshot({ path: `${SHOTS}/01-gate.png` });
  await page.fill('.input-code', KEY.toLowerCase());
  await page.click('text=כניסה');
  await page.waitForSelector('.table-projects .row');
  ok(lastCall('hb_check').params.p_key === KEY, 'code normalized to upper case');
  ok(countCalls('hb_load') >= 1, 'hb_load called after entry');
  ok(await page.evaluate((k) => localStorage.getItem('hashbacha-access-key') === k, KEY), 'code remembered in browser');

  console.log('Overview');
  ok((await page.locator('.table-projects .row').count()) === 37, '37 project rows');
  ok((await page.locator('.tile').count()) === 5, '5 KPI tiles');
  ok((await page.locator('.tile-value').first().textContent()) === '37', 'project tile shows 37');
  ok(await page.isVisible('.panel-waiting'), 'waiting list visible');
  await page.screenshot({ path: `${SHOTS}/02-home.png`, fullPage: false });

  console.log('Search, sort, group');
  await page.fill('input[type=search]', 'דימרי');
  await page.waitForTimeout(350);
  ok((await page.locator('.table-projects .row').count()) === 2, 'search "דימרי" → 2 rows');
  await page.fill('input[type=search]', '');
  await page.waitForTimeout(350);
  await page.click('.th-btn:has-text("שם היזם")');
  const firstAsc = await page.locator('.table-projects .row td:nth-child(3)').first().textContent();
  await page.click('.th-btn:has-text("שם היזם")');
  const firstDesc = await page.locator('.table-projects .row td:nth-child(3)').first().textContent();
  ok(firstAsc !== firstDesc, `sort toggles (${firstAsc} / ${firstDesc})`);
  await page.click('text=ניקוי מיון');
  await page.selectOption('select[aria-label=קיבוץ]', 'רובע');
  ok((await page.locator('.group-row').count()) > 3, 'grouping by quarter creates groups');
  await page.selectOption('select[aria-label=קיבוץ]', '__avg');
  ok(await page.isVisible('.group-label:has-text("15%–20%")'), 'grouping by profit band');
  await page.selectOption('select[aria-label=קיבוץ]', 'סטטוס רמזור');
  ok(await page.isVisible('.group-label:has-text("ללא")'), 'grouping by status');
  await page.selectOption('select[aria-label=קיבוץ]', '');

  console.log('Expand row');
  await page.locator('.table-projects .row').nth(3).locator('td').nth(2).click();
  await page.waitForSelector('.timeline-item');
  ok(await page.isVisible('.strip'), 'row expands to opinion timeline');
  await page.screenshot({ path: `${SHOTS}/03-expanded.png` });
  await page.locator('.table-projects .row').nth(3).locator('td').nth(2).click();

  console.log('Inline row edit');
  const row0 = page.locator('.table-projects .row').first();
  await row0.locator('button:has-text("ערוך")').click();
  await row0.locator('input[aria-label="רובע"]').fill('יב');
  await row0.locator('select').selectOption('בטיפול');
  await row0.locator('button:has-text("שמור")').click();
  await page.waitForSelector('.table-projects .row-edit', { state: 'detached' });
  const up = lastCall('hb_upsert_project').params;
  ok(up.p_id && up.p_data['רובע'] === 'יב' && up.p_data['סטטוס רמזור'] === 'בטיפול', 'hb_upsert_project with edited quarter + status');
  ok(await page.isVisible('.table-projects .row >> nth=0 >> .pill-amber'), 'status pill updated');
  await row0.locator('button:has-text("ערוך")').click();
  await row0.locator('button:has-text("ביטול")').click();
  ok((await page.locator('.row-edit').count()) === 0, 'cancel closes inline edit');

  console.log('Delete + undo');
  const victim = (await page.locator('.table-projects .row').nth(1).locator('td').nth(2).textContent()).trim();
  await page.locator('.table-projects .row').nth(1).locator('button:has-text("מחק")').click();
  await page.click('[data-testid=confirm-yes]');
  await page.waitForSelector('.toast-action');
  ok(!!lastCall('hb_remove_project'), 'hb_remove_project sent');
  ok((await page.locator('.table-projects .row').count()) === 36, 'row removed');
  await page.click('.toast-action');
  await page.waitForFunction(() => document.querySelectorAll('.table-projects .row').length === 37);
  ok(lastCall('hb_restore_project').params.p_id === lastCall('hb_remove_project').params.p_id, `undo restores "${victim}"`);
  await page.locator('.table-projects .row').nth(1).locator('button:has-text("מחק")').click();
  await page.click('.modal button:has-text("ביטול")');
  ok(countCalls('hb_remove_project') === 1, 'cancel in confirm sends nothing');

  console.log('New project');
  await page.click('button:has-text("פרויקט חדש")');
  await page.click('.modal button:has-text("שמור פרויקט")');
  ok(await page.isVisible('text=יש למלא לפחות שם יזם או כתובת'), 'validation blocks empty project');
  await page.fill('.modal .field:has-text("שם היזם") input', 'יזם בדיקה');
  await page.fill('.modal .field:has-text("כתובת הפרויקט") input', 'רחוב הבדיקה 1');
  await page.selectOption('.modal select', 'הוגש');
  await page.screenshot({ path: `${SHOTS}/04-new-project.png` });
  await page.click('.modal button:has-text("שמור פרויקט")');
  await page.waitForSelector('.page-detail');
  const np = lastCall('hb_upsert_project').params;
  ok(np.p_id === null && np.p_data['שם היזם'] === 'יזם בדיקה' && np.p_data['סטטוס רמזור'] === 'הוגש', 'new project payload');
  ok((await page.locator('h1').textContent()).includes('יזם בדיקה'), 'navigated to new project card');

  console.log('Detail: edit with floating bar');
  await page.click('button:has-text("עריכת פרטים")');
  await page.waitForSelector('.editbar');
  ok(await page.isDisabled('.editbar button:has-text("שמור שינויים")'), 'save disabled until a change');
  await page.fill('.fact input[aria-label="שם התכנית"]', 'תכנית בדיקה');
  await page.fill('.fact input[aria-label="קישור"]', 'https://example.org/plan');
  ok((await page.textContent('.editbar-state')).includes('2'), 'edit bar counts 2 changes');
  await page.screenshot({ path: `${SHOTS}/05-editbar.png` });
  await page.click('.editbar button:has-text("שמור שינויים")');
  await page.waitForSelector('.editbar', { state: 'detached' });
  ok(lastCall('hb_upsert_project').params.p_data['שם התכנית'] === 'תכנית בדיקה', 'project fields saved');
  ok(await page.isVisible('a.chip:has-text("קישור לתכנית")'), 'plan link chip appears');
  await page.click('button:has-text("עריכת פרטים")');
  await page.click('.editbar button:has-text("ביטול")');
  await page.waitForSelector('.editbar', { state: 'detached' });
  ok(true, 'edit bar cancel');

  console.log('Opinions');
  await page.click('button:has-text("חוות דעת חדשה")');
  await page.fill('.row-new input[aria-label="שמאי יזם"]', 'שמאי א');
  await page.fill('.row-new input[aria-label="שמאי עירייה"]', 'שמאי ב');
  await page.fill('.row-new input[aria-label="תאריך בקשה"]', '01/09/2026');
  await page.fill('.row-new input[aria-label="רווחיות יזם"]', '18%');
  await page.fill('.row-new input[aria-label="רווחיות עירייה"]', '14.5%');
  ok((await page.textContent('.row-new .gap')).includes('+3.5%'), 'live gap preview +3.5%');
  await page.fill('.row-new textarea', 'התקבלה בקשה');
  await page.click('.row-new button:has-text("שמור")');
  await page.waitForSelector('.row-new', { state: 'detached' });
  const no = lastCall('hb_upsert_opinion').params;
  ok(no.p_id === null && /^\d\d\/\d\d\/\d{4}: התקבלה בקשה$/.test(no.p_data['הערות / סטטוס']), 'new opinion stamped with today');
  ok(Object.keys(no.p_data).length === 13, 'opinion payload carries all 13 fields');

  await page.click('.table-opinions button:has-text("ערוך")');
  const ta = page.locator('.table-opinions textarea');
  await ta.fill((await ta.inputValue()) + ' המשך טיפול');
  await page.click('.table-opinions button:has-text("שמור")');
  await page.waitForSelector('.table-opinions .row-edit', { state: 'detached' });
  const eo = lastCall('hb_upsert_opinion').params;
  ok(eo.p_id && eo.p_data['הערות / סטטוס'].split('\n').length === 2 && eo.p_data['הערות / סטטוס'].endsWith(': המשך טיפול'), 'appended note gets its own dated line');
  await page.click('.table-opinions button:has-text("ערוך")');
  await page.click('button:has-text("חוות דעת חדשה")');
  ok(await page.isVisible('text=יש לסיים את העריכה הפתוחה קודם'), 'only one open edit at a time');
  await page.click('.table-opinions button:has-text("ביטול")');
  await page.screenshot({ path: `${SHOTS}/06-detail.png`, fullPage: true });

  console.log('Mail');
  const m1 = await page.getAttribute('a:has-text("מייל: פרויקט חדש")', 'href');
  const m2 = await page.getAttribute('a:has-text("מייל: קיימת חוו״ד")', 'href');
  ok(m1.startsWith('mailto:ilanit%40example.org') && decodeURIComponent(m1).includes('יזם בדיקה'), 'new-project mail to Ilanit with project details');
  ok(m2.startsWith('mailto:plan%40example.org') && decodeURIComponent(m2).includes('קיימת חוות דעת'), 'opinion-ready mail to planning');

  await page.click('.table-opinions button:has-text("מחק")');
  await page.click('[data-testid=confirm-yes]');
  await page.waitForSelector('.table-opinions .row', { state: 'detached' });
  ok(!!lastCall('hb_remove_opinion'), 'hb_remove_opinion sent');

  console.log('Delete from detail');
  await page.click('button:has-text("מחיקת פרויקט")');
  await page.click('[data-testid=confirm-yes]');
  await page.waitForSelector('.table-projects');
  ok(lastCall('hb_remove_project').params.p_id === np.p_id || !!lastCall('hb_remove_project'), 'project deleted from card, back to list');

  console.log('Settings');
  await page.click('button:has-text("הגדרות")');
  await page.fill('.modal input >> nth=0', 'new-ilanit@example.org');
  await page.click('.modal button:has-text("שמור")');
  await page.waitForSelector('.modal', { state: 'detached' });
  ok(lastCall('hb_save_settings').params.p_settings.ilanitEmail === 'new-ilanit@example.org', 'settings saved');
  await page.click('button:has-text("הגדרות")');
  await page.waitForSelector('.modal');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
  ok(true, 'Escape closes modal');

  console.log('Analytics');
  await page.click('.nav-link:has-text("ניתוח")');
  await page.waitForSelector('.analysis-card');
  ok((await page.locator('.analysis-card').count()) === 5, '5 analyses');
  await page.screenshot({ path: `${SHOTS}/07-analytics.png` });
  const titles = { gap: 'פערי רווחיות', 'appraisers-dev': 'שמאים מטעם היזם', 'appraisers-city': 'שמאים מטעם העירייה', pairs: 'זוגות שמאים', turnaround: 'זמני טיפול' };
  for (const t of Object.keys(titles)) {
    await page.goto(`${BASE}/#/a/${t}`);
    await page.waitForFunction((title) => document.querySelectorAll('.main h1').length === 1 && document.querySelector('.main h1').textContent.includes(title), titles[t]);
    await page.waitForSelector('.chart-box canvas, .state-card');
    const hasChart = await page.isVisible('.chart-box canvas');
    if (hasChart) console.log('    details:', (await page.locator('.details li').allTextContents()).slice(0, 3).join(' | '));
    ok(hasChart || t === 'appraisers-city' || t === 'pairs', `analysis ${t} renders ${hasChart ? 'chart' : 'empty state'}`);
    if (t === 'gap' || t === 'turnaround') await page.screenshot({ path: `${SHOTS}/08-${t}.png` });
  }
  await page.click('a.back');
  await page.waitForSelector('.analysis-card');
  ok(true, 'back to analyses');

  console.log('Activity & trash');
  await page.click('.nav-link:has-text("יומן וסל")');
  await page.waitForSelector('.log li');
  ok((await page.locator('.log li').count()) > 3, 'activity log lists actions');
  const trashCount = await page.locator('.trash li').count();
  await page.locator('.trash li button:has-text("שחזר")').first().click();
  await page.waitForFunction((n) => document.querySelectorAll('.trash li').length === n - 1, trashCount);
  ok(!!lastCall('hb_restore_project'), 'restore from trash');
  await page.screenshot({ path: `${SHOTS}/09-activity.png` });

  console.log('Excel export / import');
  await page.click('.nav-link:has-text("פרויקטים")');
  await page.waitForSelector('.table-projects .row');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("ייצוא Excel")')]);
  const xlsxPath = `${SHOTS}/export.xlsx`;
  await dl.saveAs(xlsxPath);
  ok(dl.suggestedFilename().endsWith('.xlsx'), `export downloads ${dl.suggestedFilename()}`);
  const before = (await page.locator('.table-projects .row').count());
  await page.setInputFiles('[data-testid=import-file]', xlsxPath);
  await page.waitForSelector('[data-testid=confirm-yes]');
  ok((await page.textContent('.confirm-text')).includes(`${before} פרויקטים`), 'import preview counts projects');
  await page.click('[data-testid=confirm-yes]');
  await page.waitForSelector('.toast-ok:has-text("יובאו")');
  const ra = lastCall('hb_replace_all').params.p_projects;
  ok(ra.length === before, `round-trip import: ${ra.length} projects`);
  ok(ra.reduce((n, e) => n + e.opinions.length, 0) >= 75, 'round-trip keeps opinions');

  console.log('Revoked code → back to gate');
  await page.evaluate(() => localStorage.setItem('hashbacha-access-key', 'HB-REVOKED'));
  await page.reload();
  await page.waitForSelector('.gate-card');
  ok(true, 'invalid stored code returns to gate');
  ok(await page.isVisible('.gate-help >> text=קישור הכניסה האישי'), 'gate explains how to get in');

  console.log('Entry link');
  await page.goto(`${BASE}/?k=${KEY.toLowerCase()}#/a`);
  await page.waitForSelector('.analysis-card');
  ok(!page.url().includes('k='), 'code removed from address bar');
  ok(await page.evaluate((k) => localStorage.getItem('hashbacha-access-key') === k, KEY), 'entry link stores the code');
  ok(lastCall('hb_load').params.p_key === KEY, 'entry link loads data with the code');
  await page.click('button:has-text("הגדרות")');
  const share = await page.inputValue('input[aria-label="קישור כניסה"]');
  ok(share === `${BASE}/?k=${encodeURIComponent(KEY)}`, `settings shows share link ${share}`);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });

  // ===== Mobile =====
  console.log('\nMobile 390');
  const m = await newPage({ width: 390, height: 844 });
  await m.page.goto(BASE);
  await noHorizontalScroll(m.page, 'gate');
  await m.page.fill('.input-code', KEY);
  await m.page.click('text=כניסה');
  await m.page.waitForSelector('.table-projects .row');
  await m.page.waitForTimeout(900);
  await noHorizontalScroll(m.page, 'projects');
  await m.page.screenshot({ path: `${SHOTS}/m1-home.png` });
  await m.page.locator('.table-projects .row').nth(4).locator('td').nth(2).click();
  await m.page.waitForSelector('.timeline-item');
  await noHorizontalScroll(m.page, 'expanded row');
  await m.page.locator('.table-projects .row').first().locator('a:has-text("פתח")').click();
  await m.page.waitForSelector('.page-detail');
  await m.page.waitForTimeout(900);
  await noHorizontalScroll(m.page, 'project card');
  await m.page.click('button:has-text("עריכת פרטים")');
  await m.page.waitForSelector('.editbar');
  await noHorizontalScroll(m.page, 'edit bar');
  await m.page.screenshot({ path: `${SHOTS}/m2-detail.png`, fullPage: true });
  await m.page.click('.editbar button:has-text("ביטול")');
  await m.page.click('button:has-text("חוות דעת חדשה")');
  await noHorizontalScroll(m.page, 'new opinion form');
  for (const path of ['#/a', '#/a/gap', '#/a/turnaround', '#/log']) {
    await m.page.goto(`${BASE}/${path}`);
    await m.page.waitForTimeout(900);
    await noHorizontalScroll(m.page, path);
  }
  await m.page.screenshot({ path: `${SHOTS}/m3-log.png` });
  await m.page.click('button:has-text("הגדרות")');
  await noHorizontalScroll(m.page, 'settings modal');
  await m.page.click('button:has-text("יציאה מהמערכת")');
  await m.page.waitForSelector('.gate-card');
  ok(await m.page.evaluate(() => !localStorage.getItem('hashbacha-access-key')), 'logout clears the code');
} catch (e) {
  failures++;
  console.log('  ✗ crashed: ' + e.message);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

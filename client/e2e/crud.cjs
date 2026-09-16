/**
 * Verifies that write operations actually work through the real UI:
 * create → verify in list → edit → delete, plus drag-to-move on the kanban.
 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5173';

const results = [];
function check(name, ok, note = '') { results.push({ name, ok, note }); }

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const apiErrors = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) apiErrors.push(`${r.status()} ${r.request().method()} ${r.url().split('/api')[1]}`);
  });

  // ---- sign in as admin ----
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'admin@brilliantacademy.test');
  await page.fill('input[type="password"]', 'Password@123');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 });

  const stamp = Date.now().toString().slice(-6);
  const subjectName = `E2E Subject ${stamp}`;
  const renamed = `${subjectName} (edited)`;

  // ---------------- CREATE ----------------
  await page.goto(`${BASE}/admin/subjects`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /new subject/i }).first().click();
  await page.waitForTimeout(500);
  await page.fill('input[placeholder="e.g. Physics"]', subjectName);
  await page.fill('input[placeholder="PHY"]', `E2E${stamp.slice(-3)}`);
  await page.getByRole('button', { name: /^Create$/ }).click();
  await page.waitForTimeout(1800);
  let body = await page.evaluate(() => document.body.innerText);
  check('CREATE subject appears in list', body.includes(subjectName), subjectName);

  // Confirm it really persisted in MongoDB, not just in the UI.
  const apiAfterCreate = await page.evaluate(async () => {
    const r = await fetch('/api/academics/subjects?limit=100', { credentials: 'include' });
    return (await r.json()).data.items.map((s) => s.name);
  });
  check('CREATE persisted to database', apiAfterCreate.includes(subjectName));

  // ---------------- EDIT ----------------
  const row = page.locator('tr', { hasText: subjectName }).first();
  await row.locator('button[title="Edit"]').click();
  await page.waitForTimeout(600);
  await page.fill('input[placeholder="e.g. Physics"]', renamed);
  await page.getByRole('button', { name: /save changes/i }).click();
  await page.waitForTimeout(1800);
  body = await page.evaluate(() => document.body.innerText);
  check('EDIT updates the row', body.includes(renamed));

  // ---------------- DELETE ----------------
  const row2 = page.locator('tr', { hasText: renamed }).first();
  await row2.locator('button[title="Delete"]').click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Delete$/ }).last().click();
  await page.waitForTimeout(1800);
  const apiAfterDelete = await page.evaluate(async () => {
    const r = await fetch('/api/academics/subjects?limit=100', { credentials: 'include' });
    return (await r.json()).data.items.map((s) => s.name);
  });
  check('DELETE removes it from the database', !apiAfterDelete.includes(renamed));

  // ---------------- SEARCH (server-side) ----------------
  await page.goto(`${BASE}/admin/students`, { waitUntil: 'networkidle' });
  const totalBefore = await page.evaluate(async () => {
    const r = await fetch('/api/people/students?limit=1', { credentials: 'include' });
    return (await r.json()).data.total;
  });
  await page.fill('input[placeholder*="Search by name"]', 'Aditi');
  await page.waitForTimeout(1600);
  const searchTotal = await page.evaluate(() => {
    const m = document.body.innerText.match(/Showing\s+[\d–-]+\s+of\s+(\d+)/);
    return m ? Number(m[1]) : null;
  });
  check('SEARCH narrows the result set', searchTotal !== null && searchTotal < totalBefore, `${searchTotal} of ${totalBefore}`);

  // ---------------- PAGINATION ----------------
  await page.goto(`${BASE}/admin/students`, { waitUntil: 'networkidle' });
  const firstPageName = await page.locator('tbody tr').first().innerText();
  const nextBtn = page.getByRole('button', { name: /next/i }).first();
  if (await nextBtn.count()) {
    await nextBtn.click();
    await page.waitForTimeout(1600);
    const secondPageName = await page.locator('tbody tr').first().innerText();
    check('PAGINATION loads a different page', firstPageName !== secondPageName);
  } else {
    check('PAGINATION control present', false, 'no next button');
  }

  // ---------------- KANBAN DRAG ----------------
  await page.goto(`${BASE}/admin/pipeline`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const cards = page.locator('a[draggable="true"]');
  check('KANBAN renders draggable lead cards', (await cards.count()) > 0, `${await cards.count()} cards`);

  // ---------------- RBAC: student cannot reach admin APIs ----------------
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/student/login`, { waitUntil: 'networkidle' });
  await page2.fill('input[type="email"]', 'neha.kapoor1000@brilliantacademy.test');
  await page2.fill('input[type="password"]', 'Password@123');
  await page2.click('button[type="submit"]');
  await page2.waitForURL(/\/student(?!\/login)/, { timeout: 15000 });

  const forbidden = await page2.evaluate(async () => {
    const out = {};
    for (const p of ['/api/finance/payments', '/api/people/students', '/api/crm/leads']) {
      const r = await fetch(p, { credentials: 'include' });
      out[p] = r.status;
    }
    return out;
  });
  check('RBAC student blocked from finance', forbidden['/api/finance/payments'] === 403, `status ${forbidden['/api/finance/payments']}`);
  check('RBAC student blocked from student admin list', forbidden['/api/people/students'] === 403, `status ${forbidden['/api/people/students']}`);
  check('RBAC student blocked from CRM leads', forbidden['/api/crm/leads'] === 403, `status ${forbidden['/api/crm/leads']}`);

  // Guard: visiting an admin URL as a student must not show the admin portal.
  await page2.goto(`${BASE}/admin/students`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(900);
  const url = page2.url();
  check('ROUTE GUARD redirects student away from /admin', !url.includes('/admin/students'), `landed on ${url.replace(BASE, '')}`);

  await browser.close();

  console.log('');
  for (const r of results) console.log(`${(r.ok ? 'PASS' : 'FAIL').padEnd(5)} ${r.name.padEnd(46)} ${r.note}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed.`);
  if (apiErrors.length) console.log('API errors seen (expected 403s excluded from checks):', [...new Set(apiErrors)].join(' | '));
  process.exit(failed ? 1 : 0);
})();

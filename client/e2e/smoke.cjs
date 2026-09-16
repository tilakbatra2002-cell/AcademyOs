/**
 * End-to-end smoke test: logs into every portal through the real UI and walks
 * every sidebar route, asserting the page renders real content and that no
 * console/page errors or failed API calls occur.
 */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5173';
const PASS = 'Password@123';

const PORTALS = [
  { key: 'owner',   email: 'owner@academyos.com',                    password: 'Owner@12345',
    routes: ['', 'organizations', 'subscriptions', 'users', 'reports', 'audit-logs', 'settings', 'profile'] },
  { key: 'admin',   email: 'admin@brilliantacademy.test',            password: PASS,
    routes: ['', 'pipeline', 'leads', 'follow-ups', 'admissions', 'students', 'parents', 'teachers', 'staff',
             'courses', 'subjects', 'videos', 'materials', 'batches', 'timetable', 'attendance', 'exams',
             'results', 'assignments', 'fee-plans', 'payments', 'invoices', 'reports', 'announcements',
             'calendar', 'documents', 'settings', 'profile'] },
  { key: 'teacher', email: 'teacher2@brilliantacademy.test',         password: PASS,
    routes: ['', 'schedule', 'batches', 'students', 'attendance', 'results', 'assignments', 'materials', 'announcements', 'profile'] },
  { key: 'student', email: 'neha.kapoor1000@brilliantacademy.test',  password: PASS,
    routes: ['', 'courses', 'materials', 'assignments', 'schedule', 'attendance', 'results', 'fees', 'announcements', 'profile'] },
  { key: 'parent',  email: 'nikhil.bansal1@brilliantacademy.test',   password: PASS,
    routes: ['', 'children', 'announcements', 'profile'] },
];

// Noise we deliberately ignore (fonts/CDN are blocked in the sandbox).
const IGNORE = [/fonts\.googleapis/, /fonts\.gstatic/, /favicon/, /ERR_NAME_NOT_RESOLVED/];

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const results = [];
  let failures = 0;

  for (const portal of PORTALS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];

    page.on('console', (m) => {
      if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) errors.push(`console: ${m.text().slice(0, 160)}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
    page.on('response', (r) => {
      const u = r.url();
      if (u.includes('/api/') && r.status() >= 400 && !IGNORE.some((x) => x.test(u))) {
        errors.push(`api ${r.status()}: ${u.replace(BASE, '')}`);
      }
    });

    // ---- login through the real form ----
    await page.goto(`${BASE}/${portal.key}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', portal.email);
    await page.fill('input[type="password"]', portal.password);
    await page.click('button[type="submit"]');

    try {
      await page.waitForURL(new RegExp(`/${portal.key}(?!/login)`), { timeout: 15000 });
    } catch {
      results.push({ portal: portal.key, route: 'login', ok: false, note: 'did not redirect after login' });
      failures++;
      await ctx.close();
      continue;
    }
    await page.waitForLoadState('networkidle');
    results.push({ portal: portal.key, route: 'login', ok: true, note: 'signed in' });

    // ---- walk every route ----
    for (const route of portal.routes) {
      const before = errors.length;
      const url = `${BASE}/${portal.key}${route ? '/' + route : ''}`;
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);

      const text = await page.evaluate(() => document.body.innerText || '');
      const hasSidebar = await page.locator('aside, nav').count();
      const crashed = /Something went wrong|Application error/i.test(text);
      const routeErrors = errors.slice(before);
      const ok = text.trim().length > 120 && hasSidebar > 0 && !crashed && routeErrors.length === 0;
      if (!ok) failures++;
      results.push({
        portal: portal.key,
        route: route || '(index)',
        ok,
        note: ok ? `${text.trim().length} chars` : (crashed ? 'crashed' : routeErrors[0] || `thin content (${text.trim().length})`),
      });
    }
    await ctx.close();
  }

  await browser.close();

  console.log('\n%-9s %-16s %-5s %s', 'PORTAL', 'ROUTE', 'OK', 'NOTE');
  for (const r of results) {
    console.log(
      `${r.portal.padEnd(9)} ${r.route.padEnd(16)} ${(r.ok ? 'PASS' : 'FAIL').padEnd(5)} ${r.note}`,
    );
  }
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed, ${failures} failures.`);
  process.exit(failures ? 1 : 0);
})();

const { chromium } = require('playwright');
const SPA = 'http://127.0.0.1:4174';
const API = 'http://127.0.0.1:4001';

const PORTALS = [
  ['owner',   'owner@academyos.com',                   'Owner@12345',  ['/owner','/owner/organizations']],
  ['admin',   'admin@brilliantacademy.test',           'Password@123', ['/admin','/admin/students','/admin/leads','/admin/courses','/admin/batches','/admin/payments']],
  ['teacher', 'teacher1@brilliantacademy.test',        'Password@123', ['/teacher','/teacher/schedule','/teacher/students','/teacher/attendance','/teacher/results']],
  ['student', 'neha.kapoor1000@brilliantacademy.test', 'Password@123', ['/student','/student/courses','/student/materials','/student/attendance','/student/results','/student/fees']],
  ['parent',  'nikhil.bansal1@brilliantacademy.test',  'Password@123', ['/parent','/parent/children']],
];

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  PASS  ' + m); };
const bad = (m) => { fail++; console.log('  FAIL  ' + m); };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-dev-shm-usage'] });

  for (const [portal, email, password, routes] of PORTALS) {
    console.log(`\n=== ${portal.toUpperCase()} ===`);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const calls = [];
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type()==='error' && !m.text().includes('401')) errors.push(m.text()); });
    page.on('request', r => { if (r.url().includes('/api/')) calls.push(r.url()); });
    const bad4xx = [];
    page.on('response', r => {
      if (r.url().includes('/api/') && r.status() >= 400 && r.status() !== 401) bad4xx.push(r.status()+' '+r.url().replace(API,''));
    });

    // direct deep-link navigation (SPA routing check)
    const resp = await page.goto(`${SPA}/${portal}/login`, { waitUntil:'domcontentloaded', timeout:60000 });
    // SPA: wait for React to mount before asserting the form exists.
    let mounted = true;
    try { await page.waitForSelector('input[type="email"]', { timeout:20000 }); } catch { mounted = false; }
    (resp.status()===200 && mounted) ? ok(`${portal}/login deep link renders (HTTP ${resp.status()})`) : bad(`${portal}/login deep link (HTTP ${resp.status()}, mounted=${mounted})`);

    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL(u => !u.pathname.endsWith('/login'), { timeout:60000 });
      ok(`${portal} login succeeded`);
    } catch { bad(`${portal} login did NOT redirect`); await ctx.close(); continue; }

    // all API calls must target the configured API origin, never the SPA origin
    const wrong = calls.filter(u => u.startsWith(SPA));
    wrong.length===0 ? ok(`all ${calls.length} API calls hit ${API}`) : bad(`${wrong.length} calls hit the SPA origin: ${wrong[0]}`);
    calls.some(u => u.includes('/api/auth/login')) ? ok('POST /api/auth/login observed') : bad('no /api/auth/login');
    calls.some(u => u.includes('/api/auth/me'))    ? ok('GET /api/auth/me observed')    : bad('no /api/auth/me');

    for (const r of routes) {
      await page.goto(SPA + r, { waitUntil:'domcontentloaded', timeout:60000 });
      await page.waitForTimeout(2200);
      const txt = (await page.locator('main').innerText().catch(()=>'')).trim();
      txt.length > 40 ? ok(`${r} rendered (${txt.length} chars)`) : bad(`${r} looks empty (${txt.length} chars)`);
    }

    // refresh persistence
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForTimeout(2500);
    !page.url().includes('/login') ? ok('session persisted after refresh') : bad('logged out after refresh');

    bad4xx.length===0 ? ok('no unexpected 4xx/5xx API responses') : bad('bad API responses: '+bad4xx.slice(0,3).join(', '));
    errors.length===0 ? ok('no JS console/page errors') : bad('JS errors: '+errors.slice(0,2).join(' | '));

    await ctx.close();
  }

  await browser.close();
  console.log(`\n================ ${pass} passed, ${fail} failed ================`);
  process.exit(fail ? 1 : 0);
})();

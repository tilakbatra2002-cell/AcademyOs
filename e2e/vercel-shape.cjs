/**
 * Browser end-to-end check of the DEPLOYED Vercel shape.
 *
 * Runs against the single-origin replica (scripts/vercel-sim.cjs), which routes
 * exactly like the root vercel.json: static SPA + /api/* serverless function +
 * SPA fallback. This is the test that would have caught the previous production
 * outage, where the SPA loaded but every /api call returned Vercel's NOT_FOUND
 * page because no function existed.
 *
 * Usage: node e2e/vercel-shape.cjs [baseUrl]
 */
const { chromium } = require('/home/user/academyos/client/node_modules/playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:3000';

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`);
  }
}

(async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();

  // Record every network call the app makes, so we can prove it is same-origin.
  const apiCalls = [];
  const crossOrigin = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/api/')) apiCalls.push(u);
    // Google Fonts is a deliberate third-party asset (Bricolage Grotesque +
    // Manrope are part of the design spec). Only flag unexpected origins.
    const allowed = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:') && !allowed.test(u)) {
      crossOrigin.push(u);
    }
  });
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  try {
    /* ---------------------------- SPA boots ---------------------------- */
    await page.goto(`${BASE}/owner/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="email"]', { timeout: 20000 });
    check('owner login page renders (React mounted)', true);

    const title = await page.title();
    check('document has a title', title.length > 0, title);

    /* ------------------------- Real login flow ------------------------- */
    await page.fill('input[type="email"]', 'owner@academyos.com');
    await page.fill('input[type="password"]', 'Owner@12345');
    await Promise.all([
      page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);
    check('login redirects away from /owner/login', true, page.url());

    // Dashboard must render data fetched from MongoDB through the function.
    await page.getByText(/Organizations|Dashboard|Academies/i).first()
      .waitFor({ timeout: 20000 });
    check('owner dashboard renders after login', true);

    const bodyText = await page.textContent('body');
    check('dashboard is not showing an API error', !/NOT_FOUND|Failed to fetch|Network error/i.test(bodyText || ''));

    /* --------------------- Same-origin API guarantee -------------------- */
    check('SPA made at least one /api call', apiCalls.length > 0, `count=${apiCalls.length}`);
    const offOrigin = apiCalls.filter((u) => !u.startsWith(BASE));
    check('every /api call is same-origin', offOrigin.length === 0, offOrigin.slice(0, 3).join(', '));
    check('no unexpected cross-origin requests (fonts allowed)', crossOrigin.length === 0, crossOrigin.slice(0, 3).join(', '));

    /* ------------------- Cookie is first-party httpOnly ----------------- */
    const cookies = await ctx.cookies();
    const at = cookies.find((c) => c.name === 'aos_at');
    check('aos_at cookie stored', !!at);
    check('aos_at is httpOnly', !!at && at.httpOnly === true);
    check('aos_at is first-party (SameSite not None)', !!at && at.sameSite !== 'None', at && at.sameSite);

    /* --------------------------- Deep links ----------------------------- */
    await page.goto(`${BASE}/owner/organizations`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/Brilliant Academy|ABC Coaching|Future Skills/i).first()
      .waitFor({ timeout: 20000 });
    const orgText = await page.textContent('body');
    check('deep link /owner/organizations renders real seeded data',
      /Brilliant Academy|ABC Coaching|Future Skills/i.test(orgText || ''));

    /* ----------------------------- Reload ------------------------------- */
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText(/Brilliant Academy|ABC Coaching|Future Skills/i).first()
      .waitFor({ timeout: 20000 });
    check('session survives a hard reload (httpOnly cookie)', !page.url().includes('/login'), page.url());

    /* ---------------------------- Logout -------------------------------- */
    // The SPA probes GET /api/auth/me on the login page to see whether a
    // session already exists; a 401 there is the expected "not logged in"
    // answer, not a fault. Everything else would be a real error.
    const fatal = consoleErrors.filter(
      (e) => !/favicon|DevTools|Download the React/i.test(e)
        && !(/401/.test(e) && /auth\/me|Unauthorized/i.test(e)),
    );
    check('no fatal console errors', fatal.length === 0, fatal.slice(0, 2).join(' | '));
  } catch (err) {
    check(`unexpected error: ${err.message}`, false);
  } finally {
    await browser.close();
  }

  console.log(`\n==== ${pass}/${pass + failures.length} browser checks passed ====`);
  if (failures.length) {
    console.log('FAILED: ' + failures.join('; '));
    process.exit(1);
  }
})();

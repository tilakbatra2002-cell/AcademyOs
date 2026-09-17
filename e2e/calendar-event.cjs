/**
 * Browser verification of the New Event form.
 *
 * Reproduces the reported bug ("Please correct the highlighted fields" with no
 * indication of which field) and proves the fix: every invalid field now shows
 * its own reason beside the input, and a valid submission actually creates the
 * event.
 *
 * Usage: node e2e/calendar-event.cjs [baseUrl]
 */
const { chromium } = require('/home/user/academyos/client/node_modules/playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { failures.push(name); console.log(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
};

/** Text of the inline error rendered by <Field error=...> for a given label. */
async function fieldError(page, label) {
  const field = page.locator('div.w-full', { has: page.locator(`label:text-is("${label}")`) }).first();
  const err = field.locator('p.text-rose-600');
  return (await err.count()) ? (await err.first().textContent() || '').trim() : null;
}

async function openNewEvent(page) {
  await page.getByRole('button', { name: /New event/i }).click();
  await page.getByText('New event', { exact: true }).last().waitFor({ timeout: 10000 });
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();

  try {
    // Log in as an academy admin (has calendar:create).
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="email"]', { timeout: 20000 });
    await page.fill('input[type="email"]', 'admin@brilliantacademy.test');
    await page.fill('input[type="password"]', 'Password@123');
    await Promise.all([
      page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);

    await page.goto(`${BASE}/admin/calendar`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /New event/i }).waitFor({ timeout: 20000 });
    check('calendar page renders with a New event button', true);

    /* ---------------- 2. required field missing -> named error ---------------- */
    await openNewEvent(page);
    await page.locator('input[placeholder*="Parent-teacher"]').fill('');
    await page.getByRole('button', { name: /Create event/i }).click();
    await page.waitForTimeout(400);

    const titleErr = await fieldError(page, 'Title');
    check('empty title shows an inline error on the Title field', !!titleErr, String(titleErr));
    check('title error states the actual reason', /required/i.test(titleErr || ''), String(titleErr));

    const banner = page.locator('div.bg-rose-50');
    const bannerText = (await banner.count()) ? await banner.first().textContent() : '';
    check(
      'the vague banner is NOT the only feedback',
      !/Please correct the highlighted fields/i.test(bannerText || ''),
      `banner="${(bannerText || '').trim()}"`,
    );

    /* ------------------- error clears when the user fixes it ------------------ */
    await page.locator('input[placeholder*="Parent-teacher"]').fill('Valid title');
    await page.waitForTimeout(250);
    check('error clears as soon as the field is corrected', !(await fieldError(page, 'Title')));

    /* ------------------------ 2b. missing start date -------------------------- */
    await page.locator('input[type="date"]').first().fill('');
    await page.getByRole('button', { name: /Create event/i }).click();
    await page.waitForTimeout(400);
    const startErr = await fieldError(page, 'Start date');
    check('empty start date shows an inline error', !!startErr, String(startErr));
    check('start date error names the reason', /required/i.test(startErr || ''), String(startErr));

    /* ----------------------- 3. invalid date ordering ------------------------- */
    await page.locator('input[type="date"]').first().fill('2026-10-20');
    await page.locator('input[type="date"]').nth(1).fill('2026-10-01');
    await page.getByRole('button', { name: /Create event/i }).click();
    await page.waitForTimeout(400);
    const endErr = await fieldError(page, 'End date');
    check('end-before-start shows an inline error on End date', !!endErr, String(endErr));
    check('end date error explains the ordering rule',
      /on or after the start date/i.test(endErr || ''), String(endErr));

    /* --------------------------- 4. length limit ------------------------------ */
    await page.locator('input[type="date"]').nth(1).fill('');
    await page.locator('input[placeholder*="Parent-teacher"]').fill('A'.repeat(161));
    await page.getByRole('button', { name: /Create event/i }).click();
    await page.waitForTimeout(400);
    const longErr = await fieldError(page, 'Title');
    check('over-long title shows a numeric limit error',
      /160/.test(longErr || ''), String(longErr));

    /* ----------------------------- 1. valid data ------------------------------ */
    const unique = `E2E Event ${Date.now()}`;
    await page.locator('input[placeholder*="Parent-teacher"]').fill(unique);
    await page.locator('input[type="date"]').first().fill('2026-10-20');
    await page.locator('textarea').fill('Created by the calendar e2e check.');
    await page.getByRole('button', { name: /Create event/i }).click();

    // The modal closes on success.
    await page.getByRole('button', { name: /Create event/i }).waitFor({ state: 'detached', timeout: 15000 });
    check('valid submission closes the modal (created)', true);

    // And the event is actually on the grid for that month.
    await page.goto(`${BASE}/admin/calendar`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /New event/i }).waitFor({ timeout: 20000 });
    // Navigate to October 2026 from the current month.
    // The month label sits beside the prev/Today/next controls; the next
    // button is the last icon button in that toolbar.
    const monthLabel = page.locator('p.font-display').last();
    const nextMonth = page.locator('button:has(svg.lucide-chevron-right)').first();
    for (let i = 0; i < 30; i++) {
      const label = (await monthLabel.textContent()) || '';
      if (/October\s+2026/i.test(label)) break;
      await nextMonth.click({ timeout: 5000 });
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(800);
    const grid = await page.textContent('body');
    check('the new event appears on the calendar grid', (grid || '').includes(unique), unique);

    /* --------------------------- 5. edit still works -------------------------- */
    await page.getByTitle(unique).first().click();
    await page.getByText('Edit event', { exact: true }).last().waitFor({ timeout: 10000 });
    check('clicking the event opens the edit modal', true);

    const renamed = `${unique} (edited)`;
    await page.locator('input[placeholder*="Parent-teacher"]').fill(renamed);
    await page.getByRole('button', { name: /Save changes/i }).click();
    await page.getByRole('button', { name: /Save changes/i }).waitFor({ state: 'detached', timeout: 15000 });
    await page.waitForTimeout(800);
    const after = await page.textContent('body');
    check('edit persists to the calendar', (after || '').includes(renamed), renamed);
  } catch (err) {
    check(`unexpected error: ${err.message.split('\n')[0]}`, false);
  } finally {
    await browser.close();
  }

  console.log(`\n==== ${pass}/${pass + failures.length} browser checks passed ====`);
  if (failures.length) { console.log('FAILED: ' + failures.join('; ')); process.exit(1); }
})();

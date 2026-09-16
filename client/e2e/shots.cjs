const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5173';
const OUT = '/home/user/academyos/screenshots';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { portal: 'admin',   email: 'admin@brilliantacademy.test',           pw: 'Password@123', routes: ['', 'pipeline', 'students', 'payments', 'reports'] },
  { portal: 'owner',   email: 'owner@academyos.com',                   pw: 'Owner@12345',  routes: ['', 'organizations'] },
  { portal: 'student', email: 'neha.kapoor1000@brilliantacademy.test', pw: 'Password@123', routes: ['', 'courses'] },
  { portal: 'teacher', email: 'teacher2@brilliantacademy.test',        pw: 'Password@123', routes: [''] },
  { portal: 'parent',  email: 'nikhil.bansal1@brilliantacademy.test',  pw: 'Password@123', routes: [''] },
];

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  for (const s of SHOTS) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${s.portal}/login`, { waitUntil: 'networkidle' });
    if (s.portal === 'admin') await p.screenshot({ path: `${OUT}/00-login.png` });
    await p.fill('input[type="email"]', s.email);
    await p.fill('input[type="password"]', s.pw);
    await p.click('button[type="submit"]');
    await p.waitForURL(new RegExp(`/${s.portal}(?!/login)`), { timeout: 15000 });
    for (const r of s.routes) {
      await p.goto(`${BASE}/${s.portal}${r ? '/' + r : ''}`, { waitUntil: 'networkidle' });
      await p.waitForTimeout(1600);
      const name = `${s.portal}-${r || 'dashboard'}`.replace(/\//g, '-');
      await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
      console.log('shot', name);
    }
    await ctx.close();
  }
  // Mobile view to confirm responsiveness.
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mp = await m.newPage();
  await mp.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await mp.fill('input[type="email"]', 'admin@brilliantacademy.test');
  await mp.fill('input[type="password"]', 'Password@123');
  await mp.click('button[type="submit"]');
  await mp.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 });
  await mp.waitForTimeout(2000);
  await mp.screenshot({ path: `${OUT}/mobile-admin.png` });
  console.log('shot mobile-admin');
  await b.close();
})();

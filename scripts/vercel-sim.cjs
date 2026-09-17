/**
 * Local replica of the Vercel edge routing described by the root vercel.json.
 *
 * It exists so we can verify the DEPLOYED shape of AcademyOS without deploying:
 * a single origin that serves the built SPA as static files, sends /api/* to the
 * serverless function (api/index.ts), sends /api/cron to the cron function, and
 * falls back to index.html for client-side routes.
 *
 * Routing precedence mirrors Vercel:
 *   1. filesystem (static assets in client/dist)
 *   2. rewrite  /api/cron   -> api/cron
 *   3. rewrite  /api/(.*)   -> api/index
 *   4. rewrite  /((?!api/).*) -> /index.html   (SPA fallback)
 *
 * Usage: node scripts/vercel-sim.cjs [port]
 * Requires: .vbuild (compiled functions) and client/dist (built SPA).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'client', 'dist');
const PORT = Number(process.argv[2] || 3000);

const apiHandler = require(path.join(ROOT, '.vbuild/api/index.js')).default;
const cronHandler = require(path.join(ROOT, '.vbuild/api/cron.js')).default;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

function sendFile(res, file, status = 200) {
  const body = fs.readFileSync(file);
  res.statusCode = status;
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
  res.end(body);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  // 2 + 3. Vercel Functions under /api/*
  if (urlPath === '/api/cron') return cronHandler(req, res);
  if (urlPath === '/api' || urlPath.startsWith('/api/')) return apiHandler(req, res);

  // 1. Filesystem precedence for real static assets.
  const candidate = path.join(DIST, urlPath);
  if (candidate.startsWith(DIST) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return sendFile(res, candidate);
  }

  // 4. SPA fallback — every non-/api route renders the React app.
  const indexHtml = path.join(DIST, 'index.html');
  if (fs.existsSync(indexHtml)) return sendFile(res, indexHtml);

  res.statusCode = 404;
  res.end('client/dist not built');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[vercel-sim] single-origin replica listening on http://0.0.0.0:${PORT}`);
});

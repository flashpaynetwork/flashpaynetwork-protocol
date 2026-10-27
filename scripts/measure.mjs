// Measures the built site in headless Edge at five widths. Usage: node scripts/measure.mjs [--shots]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const root = path.resolve('dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, r));
const url = `http://localhost:${srv.address().port}/`;

const sizes = [[360, 800], [390, 844], [430, 932], [1366, 768], [1440, 900]];
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const results = [];
let failed = 0;
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 768 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('[data-pill]')?.dataset.state !== 'syncing', null, { timeout: 40000 }).catch(() => {});
  for (let y = 0; y < 14000; y += 500) { await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(120); }
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const small = [...document.querySelectorAll('a, button, [role="tab"], .icon-btn')].filter(vis).filter((e) => !e.closest('.skel')).map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.width < 43.5 || r.height < 43.5).map(({ e, r }) => `${e.tagName}.${e.className.toString().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    const logo = document.querySelector('.brand img');
    const sx = document.querySelector('[data-record="x"]'), sg = document.querySelector('[data-record="github"]');
    const hdr = document.querySelector('.top');
    const ca = document.querySelector('.ca-label')?.parentElement;
    const caText = document.querySelector('.ca-addr, .ca-pending');
    const rows = [...document.querySelectorAll('.row:not(.skel):not(.ph)')];
    const rect = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    return {
      vw: innerWidth, scrollW: document.documentElement.scrollWidth, overflowX: document.documentElement.scrollWidth - innerWidth,
      logo: { loaded: logo.complete && logo.naturalWidth > 0, natural: logo.naturalWidth + 'x' + logo.naturalHeight, box: rect(logo) },
      social: { x: rect(sx), gh: rect(sg), inHeaderTop: rect(sx).y < 64 && rect(sg).y < 64, rightEdge: rect(sg).x + rect(sg).w },
      header: rect(hdr), caFont: getComputedStyle(caText).fontSize, caBox: rect(ca),
      smallTargets: small,
      rows: rows.length, tiles: document.querySelectorAll('.row .tile').length,
      h1: getComputedStyle(document.querySelector('h1')).fontSize,
      docH: document.documentElement.scrollHeight,
      pill: document.querySelector('[data-pill]').dataset.state,
    };
  });
  const bad = [];
  if (m.overflowX > 0) bad.push('horizontal overflow ' + m.overflowX);
  if (!m.logo.loaded) bad.push('logo not loaded');
  if (!m.social.inHeaderTop) bad.push('social not top-right');
  if (m.social.rightEdge > m.vw) bad.push('social off-screen');
  if (m.smallTargets.length) bad.push('tap targets <44: ' + m.smallTargets.join('; '));
  if (m.pill === 'live' && m.rows !== 10) bad.push('rows ' + m.rows);
  m.bad = bad; failed += bad.length ? 1 : 0;
  results.push(m);
  if (process.argv.includes('--shots')) { fs.mkdirSync('.tmp', { recursive: true }); await page.screenshot({ path: `.tmp/shot-${w}.png`, fullPage: false }); await page.screenshot({ path: `.tmp/full-${w}.png`, fullPage: true }); }
  await ctx.close();
}
await browser.close(); srv.close();
for (const m of results) console.log(m.vw, JSON.stringify({ overflowX: m.overflowX, logo: m.logo, social: m.social, header: m.header, caFont: m.caFont, caBox: m.caBox, rows: m.rows, h1: m.h1, docH: m.docH, pill: m.pill, bad: m.bad }));
console.log(failed ? `MEASURE FAIL (${failed} breakpoints)` : 'MEASURE OK (5 breakpoints)');
process.exit(failed ? 1 : 0);

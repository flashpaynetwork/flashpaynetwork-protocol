// Build: src/ + brand/ + register.json  ->  dist/  (or --out dir with --register file for the gates)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { load, validate, handle, runtime } from './register.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', 'dist');
const REG = arg('--register', 'register.json');
const LOGO = 'brand/LOGO FLASH PNG...png'; // RGBA, transparent background (pure-black RGB under alpha 0)

const reg = load(REG);
const errs = validate(reg);
if (errs.length) { console.error('register invalid:\n  ' + errs.join('\n  ')); process.exit(1); }
const R = reg.records;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- assets ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'assets', 'js'), { recursive: true });

async function trimmed() {
  // trim on alpha: a premultiplied copy keeps the black-under-transparent pixels from influencing the box
  const { data, info } = await sharp(LOGO).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { data, info, box: { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } };
}
const T = await trimmed();
const crop = () => sharp(T.data, { raw: { width: T.info.width, height: T.info.height, channels: 4 } }).extract(T.box);
// sharp/libvips premultiplies RGBA before resizing and unpremultiplies after: colour is weighted by alpha, so the black under transparent pixels never bleeds into edges
const premulResize = (w, h) => crop().resize(w, h, { kernel: 'lanczos3' }).png({ compressionLevel: 9 });
await premulResize(174, 56).toFile(path.join(OUT, 'assets', 'logo-nav.png'));
await premulResize(960, Math.round(960 * T.box.height / T.box.width)).toFile(path.join(OUT, 'assets', 'logo-hero.png'));

// favicon: first glyph of the wordmark, traced cell by cell from the real alpha grid
async function favicon() {
  const cols = new Array(T.box.width).fill(0);
  for (let y = T.box.top; y < T.box.top + T.box.height; y++) for (let x = 0; x < T.box.width; x++) if (T.data[(y * T.info.width + T.box.left + x) * 4 + 3] > 8) cols[x]++;
  let gx0 = cols.findIndex((c) => c > 0), gx1 = gx0; while (cols[gx1 + 1] > 0) gx1++;
  const gw = gx1 - gx0 + 1, gh = T.box.height;
  const target = 22; // glyph height in the 32 grid
  const cw = Math.max(1, Math.round(gw * target / gh));
  const g = await sharp(T.data, { raw: { width: T.info.width, height: T.info.height, channels: 4 } })
    .extract({ left: T.box.left + gx0, top: T.box.top, width: gw, height: gh }).resize(cw, target, { kernel: 'lanczos3' }).raw().toBuffer();
  const ox = Math.round((32 - cw) / 2), oy = Math.round((32 - target) / 2);
  const rects = [];
  for (let y = 0; y < target; y++) {
    let x = 0;
    while (x < cw) {
      if (g[(y * cw + x) * 4 + 3] >= 128) { let e = x; while (e < cw && g[(y * cw + e) * 4 + 3] >= 128) e++; rects.push(`<rect x="${ox + x}" y="${oy + y}" width="${e - x}" height="1"/>`); x = e; } else x++;
    }
  }
  const pal = JSON.parse(fs.readFileSync('src/palette.json', 'utf8'));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges"><rect width="32" height="32" rx="7" fill="${pal.primary}"/><g fill="${pal.paper}">${rects.join('')}</g></svg>\n`;
}
fs.writeFileSync(path.join(OUT, 'favicon.svg'), await favicon());

// ---------- static pieces ----------
fs.writeFileSync(path.join(OUT, 'assets', 'app.css'), (fs.readFileSync('src/tokens.css', 'utf8') + '\n' + fs.readFileSync('src/styles.css', 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{2,}/g, '\n'));
for (const f of fs.readdirSync('src/js')) fs.copyFileSync(path.join('src/js', f), path.join(OUT, 'assets', 'js', f));

// ---------- render from the register ----------
const X_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const GH_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';

function socialIcon(id, icon, name) {
  const r = R[id];
  if (r.state === 'stated') {
    const h = handle(r);
    return `      <a class="icon-btn" data-record="${id}" data-state="stated" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" aria-label="${name} (${esc(h)})">${icon}</a>`;
  }
  return `      <span class="icon-btn is-inert" data-record="${id}" data-state="${r.state}" role="img" aria-disabled="true" aria-label="${name}, pending">${icon}</span>`;
}
const SOCIAL = socialIcon('x', X_ICON, 'X') + '\n' + socialIcon('github', GH_ICON, 'GitHub');

function caSlot() {
  const r = R.ca;
  if (r.state === 'stated') {
    return `    <button class="ca" type="button" data-record="ca" data-state="stated" data-copy="${esc(r.value)}" aria-label="Copy contract address">
      <span class="ca-label">${esc(r.label)}</span>
      <span class="ca-addr">${esc(r.value)}</span>
      <span class="ca-fb" role="status" aria-live="polite" data-fb>Copy</span>
    </button>`;
  }
  return `    <div class="ca is-inert" data-record="ca" data-state="${r.state}">
      <span class="ca-label">${esc(r.label)}</span>
      <span class="ca-pending">pending</span>
    </div>`;
}

const chainName = R.chain.state === 'stated' ? R.chain.value : 'the chain';
const chip = (id, text) => {
  const r = R[id];
  return r.state === 'stated'
    ? `<span class="chip" data-record="${id}" data-state="stated"><i class="chip-dot"></i>${esc(text || r.value)}</span>`
    : `<span class="chip is-inert" data-record="${id}" data-state="${r.state}"><span>${esc(r.label)}</span><em>pending</em></span>`;
};
const heroChips = chip('chain', R.chain.value ? 'Chain: ' + R.chain.value : '') + '\n        ' + chip('market', R.market.value ? 'Feed: ' + R.market.value : '');

const rpcHost = R.chain.state === 'stated' && R.chain.rpc ? new URL(R.chain.rpc).host : null;
const fact = (id, left, right) => {
  const r = R[id];
  return r.state === 'stated'
    ? `        <li data-record="${id}" data-state="stated"><span>${esc(left)}</span><b>${esc(right)}</b></li>`
    : `        <li class="is-inert" data-record="${id}" data-state="${r.state}"><span>${esc(r.label)}</span><em>pending</em></li>`;
};
const facts = [
  fact('chain', 'Chain', R.chain.value),
  fact('market', 'Market feed', R.market.value),
  fact('ca', 'Contract', R.ca.value),
  fact('x', 'X', R.x.url && handle(R.x) ? '@' + handle(R.x) : ''),
  fact('github', 'GitHub', R.github.url ? handle(R.github) : ''),
].join('\n');

const ctaLink = (id, icon, name) => {
  const r = R[id];
  return r.state === 'stated'
    ? `      <a class="btn btn-light" data-record="${id}" data-state="stated" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"><span class="btn-ic">${icon}</span>${name}</a>`
    : `      <span class="btn btn-light is-inert" data-record="${id}" data-state="${r.state}" aria-disabled="true"><span class="btn-ic">${icon}</span>${name}<em>pending</em></span>`;
};
const ctaLinks = ctaLink('x', X_ICON, 'X') + '\n' + ctaLink('github', GH_ICON, 'GitHub');

const skelRows = Array.from({ length: 10 }, (_, i) => `        <li class="row skel" style="--i:${i}" aria-hidden="true"><span class="tile sk"></span><span class="sk line w60"></span><span class="sk line r"></span><span class="sk line r"></span><span class="sk line r"></span><span class="sk line r"></span><span class="sk line r"></span></li>`).join('\n');
const skelMini = Array.from({ length: 5 }, (_, i) => `          <li class="mini-row skel" style="--i:${i}" aria-hidden="true"><span class="tile sm sk"></span><span class="sk line w60"></span><span class="sk line r"></span></li>`).join('\n');
const skelTicker = Array.from({ length: 12 }, () => '    <span class="tick-item skel" aria-hidden="true"><span class="sk line w60"></span></span>').join('\n');

const marketNote = R.market.state === 'stated' ? `Feed: ${esc(R.market.value)}.` : 'Market feed: pending.';
const footChain = chip('chain', R.chain.value ? 'Chain: ' + R.chain.value : '');

let html = fs.readFileSync('src/index.html', 'utf8');
const sub = { THEME: JSON.parse(fs.readFileSync('src/palette.json', 'utf8')).primary, SOCIAL, CA: caSlot(), CHAIN: esc(chainName), HERO_CHIPS: heroChips, SKEL_MINI: skelMini, SKEL_TICKER: skelTicker, SKEL_ROWS: skelRows, MARKET_NOTE: marketNote, FACTS: facts, CTA_LINKS: ctaLinks, FOOT_CHAIN: footChain, REGISTER: JSON.stringify(runtime(reg)).replace(/</g, '\\u003c') };
for (const [k, v] of Object.entries(sub)) html = html.split(`{{${k}}}`).join(v);
const left = html.match(/\{\{[A-Z_]+\}\}/g);
if (left) { console.error('unfilled placeholders', left); process.exit(1); }
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// ---------- build-time proof that the logo is shipped and referenced ----------
const need = ['assets/logo-nav.png', 'assets/logo-hero.png', 'favicon.svg', 'assets/app.css', 'assets/js/main.js'];
for (const f of need) if (!fs.existsSync(path.join(OUT, f))) { console.error('missing in output:', f); process.exit(1); }
if (!/src="assets\/logo-nav\.png"/.test(html)) { console.error('index.html does not reference assets/logo-nav.png'); process.exit(1); }
console.log(`built ${OUT}/ (${fs.readdirSync(path.join(OUT, 'assets')).length} asset entries)`);

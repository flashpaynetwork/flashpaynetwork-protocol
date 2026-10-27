// Gates: builds dist/, proves both register branches by building mutated variants, exits 0 only if every gate passes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { load, validate, handle, IDS } from './register.mjs';

const gates = [];
const gate = (name, fn) => gates.push([name, fn]);
const read = (f) => fs.readFileSync(f, 'utf8');
const walk = (d, skip = []) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (skip.includes(e.name)) return [];
  return e.isDirectory() ? walk(p, skip) : [p];
});
const SKIP = ['node_modules', '.tmp', 'dist', '.git'];
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]*>/g, '. ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

fs.mkdirSync('.tmp', { recursive: true });
const FIX = {
  ca: 'So11111111111111111111111111111111111111112',
  x: 'https://x.com/flashfixture',
  github: 'https://github.com/flash-fixture',
};
function runBuild(regObj, name) {
  const rf = `.tmp/reg-${name}.json`, out = `.tmp/out-${name}`;
  fs.writeFileSync(rf, JSON.stringify(regObj, null, 2));
  const r = spawnSync(process.execPath, ['scripts/build.mjs', '--register', rf, '--out', out], { encoding: 'utf8' });
  return { ok: r.status === 0, out, log: (r.stdout || '') + (r.stderr || '') };
}
// state-independent mutation: read the current record, force the requested state
function setState(reg, id, state) {
  const r = JSON.parse(JSON.stringify(reg));
  const rec = r.records[id];
  rec.state = state;
  if (state === 'stated') {
    if (id === 'ca') rec.value = FIX.ca;
    else if (id === 'x' || id === 'github') rec.url = FIX[id];
    else if (id === 'chain') { rec.value = rec.value || 'Solana'; rec.rpc = rec.rpc || 'https://solana-rpc.publicnode.com'; }
    else if (id === 'market') { rec.value = rec.value || 'DexScreener'; rec.url = rec.url || 'https://api.dexscreener.com/token-boosts/top/v1'; rec.pairs = rec.pairs || 'https://api.dexscreener.com/tokens/v1/solana/{addresses}'; }
  } else for (const k of ['value', 'url', 'rpc', 'pairs']) delete rec[k];
  return r;
}
const allAs = (reg, state) => IDS.reduce((r, id) => setState(r, id, state), reg);
const REG = load();

// address scanner: address-shaped strings must match a stated registry value; CA slot is exempt
const B58 = /(?<![A-Za-z0-9])[1-9A-HJ-NP-Za-km-z]{32,44}(?![A-Za-z0-9])/g;
const EVM = /(?<![A-Za-z0-9])0x[0-9a-fA-F]{40}(?![A-Za-z0-9])/g;
function scanAddresses(text, registry) {
  const stated = new Set();
  for (const r of Object.values(registry.records)) if (r.state === 'stated') for (const v of [r.value, r.url, r.rpc, r.pairs]) if (v) stated.add(v);
  const bad = [];
  const stripped = text.replace(/<(button|div)[^>]*data-record="ca"[\s\S]*?<\/\1>/g, ' ');
  for (const re of [B58, EVM]) for (const m of stripped.matchAll(re)) if (!stated.has(m[0]) && !/^[a-z]+$/.test(m[0])) bad.push(m[0]);
  return bad;
}

// ---------------------------------------------------------------- build the real thing first
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const real = spawnSync(process.execPath, ['scripts/build.mjs'], { encoding: 'utf8' });
const distHtml = () => read('dist/index.html');
const distFiles = () => walk('dist');

gate('register: current register.json valid, inert records carry no value or url', () => {
  const e = validate(REG); if (e.length) throw new Error(e.join('; '));
});
gate('register: validator rejects an inert record that carries a value or url (negative)', () => {
  const bad = JSON.parse(JSON.stringify(REG)); bad.records.x.url = 'https://x.com/nobody'; bad.records.ca.value = FIX.ca;
  const e = validate(bad); if (e.length < 2) throw new Error('validator accepted bad register');
});
gate('build: npm run build exits 0 and writes dist/', () => { if (real.status !== 0) throw new Error(real.stdout + real.stderr); if (!fs.existsSync('dist/index.html')) throw new Error('no dist/index.html'); });
gate('deploy: dist/ holds only site files (no readme, license, docs, register, scripts)', () => {
  const names = distFiles().map((f) => path.relative('dist', f).replace(/\\/g, '/'));
  const stray = names.filter((n) => /readme|license|whitepaper|register|palette|package|scripts|\.md$/i.test(n)); if (stray.length) throw new Error(stray.join(', '));
});
gate('logo: file copied into dist/ and index.html references it by relative path', () => {
  const h = distHtml();
  if (!/src="assets\/logo-nav\.png"/.test(h)) throw new Error('index.html lacks relative reference');
  if (/(?:src|href)="\/[^/]/.test(h)) throw new Error('root-absolute path found');
  for (const m of h.matchAll(/(?:src|href)="(?!https?:|#|data:|mailto:)([^"]+)"/g)) if (!fs.existsSync(path.join('dist', m[1]))) throw new Error('dangling ref ' + m[1]);
});
gate('logo: dist PNG is RGBA with intact edges (premultiplied resize, no dark halo)', async () => {
  const { data, info } = await sharp('dist/assets/logo-nav.png').raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error('no alpha channel');
  const pal = JSON.parse(read('src/palette.json')); const p = [1, 3, 5].map((i) => parseInt(pal.primary.slice(i, i + 2), 16));
  let partial = 0, off = 0;
  for (let i = 0; i < data.length; i += 4) { const a = data[i + 3]; if (a >= 24) { partial += a < 255 ? 1 : 0; const d = Math.max(Math.abs(data[i] - p[0]), Math.abs(data[i + 1] - p[1]), Math.abs(data[i + 2] - p[2])); if (d > 40) off++; } }
  if (off > 0) throw new Error(off + ' edge pixels off-colour (halo)');
  const src = await sharp('brand/LOGO FLASH PNG...png').raw().toBuffer({ resolveWithObject: true });
  if (src.info.channels !== 4) throw new Error('source not RGBA');
});
gate('favicon: svg 32x32, traced rects, no xml comment or double hyphen, linked from html', () => {
  const s = read('dist/favicon.svg');
  if (!/viewBox="0 0 32 32"/.test(s) || !/width="32"/.test(s) || !/height="32"/.test(s)) throw new Error('not 32x32');
  if (/<!--/.test(s) || /--/.test(s)) throw new Error('comment or double hyphen');
  if ((s.match(/<rect /g) || []).length < 12) throw new Error('not traced');
  if (!/rel="icon" href="favicon\.svg"/.test(distHtml())) throw new Error('not linked');
});
gate('dates: no date, timestamp, clock or "as of" wording anywhere in dist/', () => {
  const bad = [];
  for (const f of distFiles()) {
    if (/\.png$/.test(f)) continue;
    const t = read(f).split('http://www.w3.org/2000/svg').join('');
    const hits = t.match(/\b(19|20)\d{2}\b|\b\d{1,2}:\d{2}\b|\bas of\b|\bchecked\b|\bupdated\b|\btimestamp\b|\b(Jan(uary)?|Feb(ruary)?|Mar(ch)?|Apr(il)?|May|June?|July?|Aug(ust)?|Sep(t(ember)?)?|Oct(ober)?|Nov(ember)?|Dec(ember)?)\.? \d|toLocale(Date|Time)String|toISOString|getFullYear|new Date|Intl\.DateTimeFormat/gi);
    if (hits) bad.push(path.basename(f) + ': ' + hits.slice(0, 3).join(','));
  }
  if (bad.length) throw new Error(bad.join(' | '));
});
gate('palette: colour literals live only in tokens.css; favicon and meta use sampled values', () => {
  const pal = Object.values(JSON.parse(read('src/palette.json')));
  const lit = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\boklab\(/g;
  const bad = [];
  for (const f of walk('src', [])) { if (/tokens\.css$|palette\.json$/.test(f)) continue; const m = read(f).match(lit); if (m) bad.push(f + ' ' + m[0]); }
  for (const f of walk('scripts', [])) { if (/palette\.mjs$|kmeans\.mjs$|gates\.mjs$|measure\.mjs$/.test(f)) continue; const m = read(f).match(lit); if (m) bad.push(f + ' ' + m[0]); }
  const css = read('dist/assets/app.css').replace(/:root \{[\s\S]*?\n\}\n/, '');
  if (lit.test(css)) bad.push('dist app.css outside tokens');
  for (const f of ['dist/favicon.svg', 'dist/index.html']) for (const m of read(f).matchAll(/#[0-9a-fA-F]{6}\b/g)) if (!pal.includes(m[0].toLowerCase())) bad.push(f + ' unsampled ' + m[0]);
  if (bad.length) throw new Error(bad.join(' | '));
});
gate('palette: every token traces to a real pixel at its recorded coordinate', async () => {
  const css = read('src/tokens.css'); let n = 0;
  for (const m of css.matchAll(/--c-([a-z-]+): (#[0-9a-f]{6}); \/\* (.+?) k=\d+ region .*? px\((\d+),(\d+)\)/g)) {
    const buf = await sharp(m[3]).extract({ left: +m[4], top: +m[5], width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    const hex = '#' + [...buf].map((v) => v.toString(16).padStart(2, '0')).join('');
    if (hex !== m[2]) throw new Error(`${m[1]} ${m[2]} != pixel ${hex}`); n++;
  }
  if (n < 10) throw new Error('only ' + n + ' provenance lines');
});
gate('measure: no ch units in css or markup', () => {
  for (const f of ['src/styles.css', 'src/index.html', 'dist/assets/app.css']) if (/(?<![A-Za-z-])\d*\.?\d+ch\b/.test(read(f))) throw new Error('ch unit in ' + f);
});
gate('social: both icons in the header at every breakpoint, icon only, official marks, never hidden', () => {
  const h = distHtml();
  const hdr = h.match(/<header class="top"[\s\S]*?<\/header>/)[0];
  const soc = hdr.match(/<div class="social"[\s\S]*?<\/div>/)[0];
  if (!/data-record="x"/.test(soc) || !/data-record="github"/.test(soc)) throw new Error('missing icon');
  if (visible(soc).replace(/[.\s]/g, '').length) throw new Error('icon carries text');
  if (!soc.includes('M18.244 2.25h3.308') || !soc.includes('M8 0c4.42 0 8 3.58 8 8')) throw new Error('not the official marks');
  const css = read('src/styles.css');
  if (/\.social[^{]*\{[^}]*display:\s*none/.test(css) || /\.icon-btn[^{]*\{[^}]*display:\s*none/.test(css)) throw new Error('icons hidden by css');
});
gate('social branches: absent renders inert with no href; stated renders href and derived handle', () => {
  const a = runBuild(allAs(REG, 'absent'), 'abs'), s = runBuild(allAs(REG, 'stated'), 'sta');
  if (!a.ok || !s.ok) throw new Error(a.log + s.log);
  const ha = read(a.out + '/index.html'), hs = read(s.out + '/index.html');
  for (const id of ['x', 'github']) {
    const ea = ha.match(new RegExp(`<[a-z]+ [^>]*data-record="${id}"[^>]*data-state="absent"[^>]*>`, 'g'));
    if (!ea || ea.some((t) => /href=|target=/.test(t) || (/icon-btn|class="btn/.test(t) && !/aria-disabled="true"/.test(t)))) throw new Error(id + ' absent not inert');
    const es = hs.match(new RegExp(`<a [^>]*data-record="${id}"[^>]*data-state="stated"[^>]*>`, 'g'));
    if (!es || !es.every((t) => t.includes(`href="${FIX[id]}"`))) throw new Error(id + ' stated link wrong');
  }
  if (!hs.includes('aria-label="X (flashfixture)"') || !hs.includes('aria-label="GitHub (flash-fixture)"')) throw new Error('handle not derived from url');
  if (/x\.com|github\.com\//.test(ha)) throw new Error('absent build leaks a url');
});
gate('ca branches: absent is label + pending only; stated shows full address, copy button, feedback slot', () => {
  const ha = read('.tmp/out-abs/index.html'), hs = read('.tmp/out-sta/index.html');
  const ca = ha.match(/<div class="ca is-inert"[\s\S]*?<\/div>/)[0];
  if (visible(ca).replace(/\./g, '').replace(/\s+/g, ' ').trim() !== 'Contract address pending') throw new Error('absent text: ' + visible(ca));
  if (/data-copy/.test(ca)) throw new Error('inert slot carries a value');
  if (!new RegExp(`<button class="ca"[^>]*data-copy="${FIX.ca}"`).test(hs) || !new RegExp(`<span class="ca-addr">${FIX.ca}</span>`).test(hs) || !/data-fb/.test(hs)) throw new Error('stated slot incomplete');
  const css = read('src/styles.css'); const m = css.match(/\.ca-addr \{[^}]*font-size: clamp\(([^)]*)\)/);
  if (!m || parseInt(m[1].split(',').pop().replace(/\D/g, ''), 10) < 24) throw new Error('slot font not large');
  if (!/\.copied|copied/.test(read('src/js/copy.js'))) throw new Error('no copy feedback');
});
gate('ca position: contract row sits in the sticky header, above the main content', () => {
  const h = distHtml();
  if (!(h.indexOf('class="ca') > h.indexOf('<header class="top"') && h.indexOf('class="ca') < h.indexOf('</header>'))) throw new Error('not in header');
  if (!/\.top \{[^}]*position: sticky;[^}]*top: 0/.test(read('src/styles.css'))) throw new Error('header not sticky');
});
gate('address scanner: flags strangers, accepts registry values, never blanket-rejects 0x hex', () => {
  const evm = '0x' + 'ab12'.repeat(10);
  const reg0 = { records: { ca: { state: 'absent' }, x: { state: 'absent' } } };
  const regEvm = { records: { ca: { state: 'absent' }, aux: { state: 'stated', value: evm } } };
  if (scanAddresses(`<p>${evm}</p>`, reg0).length !== 1) throw new Error('stranger 0x not flagged');
  if (scanAddresses(`<p>${evm}</p>`, regEvm).length !== 0) throw new Error('stated 0x wrongly rejected');
  if (scanAddresses(`<p>${FIX.ca}</p>`, reg0).length !== 1) throw new Error('stranger base58 not flagged');
  if (scanAddresses(`<button data-record="ca" data-copy="${FIX.ca}"><span>${FIX.ca}</span></button>`, reg0).length !== 0) throw new Error('CA slot not exempt');
  for (const f of distFiles()) if (/\.(html|js|css|svg)$/.test(f)) { const b = scanAddresses(read(f), REG); if (b.length) throw new Error(f + ': ' + b[0]); }
  for (const v of ['abs', 'sta']) { const b = scanAddresses(read(`.tmp/out-${v}/index.html`), v === 'abs' ? allAs(REG, 'absent') : allAs(REG, 'stated')); if (b.length) throw new Error(v + ': ' + b[0]); }
});
gate('inert records: no value or url reaches markup or the runtime register', () => {
  const h = read('.tmp/out-abs/index.html');
  const rj = JSON.parse(h.match(/<script type="application\/json" id="register">([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, '<'));
  for (const [id, r] of Object.entries(rj.records)) { if (r.state !== 'stated' && Object.keys(r).some((k) => !['label', 'state'].includes(k))) throw new Error(id + ' leaks'); if (['recorded', 'source', 'scope', 'rpc'].some((k) => k in r)) throw new Error('metadata leaked'); }
  for (const t of h.match(/<[a-z]+ [^>]*data-state="(absent|unconfirmed)"[^>]*>/g) || []) if (/href=|data-copy=|target=/.test(t)) throw new Error('inert element active: ' + t);
});
gate('market independence: contract state has zero effect on market markup and code', () => {
  const a = runBuild(setState(REG, 'ca', 'absent'), 'caA'), b = runBuild(setState(REG, 'ca', 'stated'), 'caB');
  if (!a.ok || !b.ok) throw new Error(a.log + b.log);
  const frag = (h) => h.match(/<section class="section" id="market">[\s\S]*?<\/section>/)[0] + h.match(/<ul class="mini"[\s\S]*?<\/ul>/)[0] + h.match(/<div class="ticker"[\s\S]*?<\/div>\s*<\/div>/)[0];
  if (frag(read(a.out + '/index.html')) !== frag(read(b.out + '/index.html'))) throw new Error('market markup differs');
  const js = (d) => crypto.createHash('sha1').update(read(d + '/assets/js/market.js')).digest('hex');
  if (js(a.out) !== js(b.out)) throw new Error('market.js differs');
  if (/records\.ca|REG\.ca|\.ca\b/.test(read('src/js/market.js').replace(/\.canvas/g, ''))) throw new Error('market.js reads the ca record');
});
gate('market follows its own record: mutating market flips the feed and nothing else', () => {
  const off = runBuild(setState(REG, 'market', 'absent'), 'mOff'); if (!off.ok) throw new Error(off.log);
  const h = read(off.out + '/index.html');
  if (/api\.dexscreener/.test(h)) throw new Error('feed url present while market inert');
  if (!/Market feed: pending/.test(h)) throw new Error('no pending note');
  if (!/data-record="chain" data-state="stated"/.test(h)) throw new Error('chain disturbed');
  const on = distHtml(); if (!/api\.dexscreener\.com\/token-boosts\/top\/v1/.test(on)) throw new Error('stated market lacks url');
});
gate('mutation harness: every record, read at runtime, flipped to its opposite; anchors survive both states', () => {
  for (const id of IDS) {
    const cur = REG.records[id].state;
    const to = cur === 'stated' ? 'absent' : 'stated';
    const m = runBuild(setState(REG, id, to), 'mut-' + id); if (!m.ok) throw new Error(id + ': ' + m.log);
    const base = distHtml(), mut = read(m.out + '/index.html');
    const st = (h) => (h.match(new RegExp(`data-record="${id}" data-state="([a-z]+)"`)) || [])[1];
    if (st(base) !== cur) throw new Error(`${id}: anchor missing in current build`);
    if (st(mut) !== to) throw new Error(`${id}: anchor missing or wrong after mutation (${st(mut)} != ${to})`);
    for (const other of IDS) if (other !== id) { const g = (h) => (h.match(new RegExp(`data-record="${other}" data-state="([a-z]+)"`)) || [])[1]; if (g(base) !== g(mut)) throw new Error(`${id} mutation moved ${other}`); }
  }
});
gate('motion: reduced-motion fallback covers css animation, transitions and every js effect', () => {
  const css = read('src/styles.css'); const rm = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*$/);
  if (!rm || !/animation: none !important/.test(rm[0]) || !/transition-duration: \.01ms !important/.test(rm[0])) throw new Error('css fallback incomplete');
  const js = read('src/js/motion.js');
  if (!/prefers-reduced-motion: reduce/.test(js)) throw new Error('js does not read the preference');
  for (const fn of ['spring', 'initReveal', 'initParallax', 'initSpotlight', 'countUp', 'flash']) { const body = (js.split(new RegExp(`function ${fn}\\b`))[1] || '').split('export function')[0]; if (!/reduced/.test(body)) throw new Error(fn + ' ignores reduced motion'); }
});
gate('visual: reveal spring, parallax layers, spotlight, progress bar, pulsing dot, skeletons, count-up present', () => {
  const h = distHtml(), css = read('src/styles.css'), js = read('src/js/motion.js');
  if ((h.match(/data-reveal/g) || []).length < 20) throw new Error('few reveals');
  if ((h.match(/data-depth/g) || []).length < 6) throw new Error('few parallax layers');
  if ((h.match(/data-spot/g) || []).length < 8) throw new Error('few spotlights');
  if (!/data-progress/.test(h) || !/\.dot::after/.test(css) || !/@keyframes ping/.test(css) || !/@keyframes shimmer/.test(css) || !/@keyframes drift/.test(css)) throw new Error('missing pieces');
  if ((h.match(/class="row skel"/g) || []).length !== 10) throw new Error('skeleton rows != 10');
  if (!/stiffness/.test(js) || !/damping/.test(js) || !/export function countUp/.test(js) || !/export function flash/.test(js)) throw new Error('spring or count-up missing');
});
gate('market engine: solana filter, top 10 by volume, imageUrl + letter fallback, copy, 60s poll, hidden pause, backoff, dash on failure', () => {
  const js = read('src/js/market.js');
  const need = [/chainId === 'solana'/, /slice\(0, 10\)/, /imageUrl/, /onerror = letter/, /copyText\(it\.addr\)/, /60000/, /document\.hidden/, /visibilitychange/, /d \* 2/, /placeholders\(\)/, /DASH/, /rec\.url/, /rec\.pairs/, /liquidity/, /priceChange/];
  for (const re of need) if (!re.test(js)) throw new Error('missing ' + re);
  if (/dexscreener/i.test(js)) throw new Error('feed url hard-coded in js');
});
gate('network: external hosts in dist limited to the font host; feed urls come only from the register', () => {
  const hosts = new Set();
  for (const f of distFiles()) if (/\.(html|css|js)$/.test(f)) for (const m of read(f).matchAll(/https?:\/\/([a-z0-9.-]+)/g)) hosts.add(m[1]);
  const ok = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.w3.org', 'api.dexscreener.com', 'solana-rpc.publicnode.com'];
  const bad = [...hosts].filter((h) => !ok.includes(h)); if (bad.length) throw new Error(bad.join(', '));
});
gate('originality: zero 2-grams shared with the reference site copy', () => {
  const ref = new Set(JSON.parse(read('scripts/ref-bigrams.json')));
  let text = visible(distHtml());
  for (const f of ['market.js', 'copy.js']) for (const m of read('dist/assets/js/' + f).matchAll(/'([^'\n]{8,200})'/g)) if (/ /.test(m[1]) && !/[{};=<>]/.test(m[1])) text += ' . ' + m[1];
  const shared = new Set();
  for (const seg of text.split(/[.!?\n|·—–:;,()]+/)) { const w = seg.toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9]+/).filter(Boolean); for (let i = 0; i + 1 < w.length; i++) if (ref.has(crypto.createHash('sha1').update(w[i] + ' ' + w[i + 1]).digest('hex').slice(0, 10))) shared.add(w[i] + ' ' + w[i + 1]); }
  if (shared.size) throw new Error([...shared].join(' | '));
});
gate('hygiene: no CLAUDE.md, no .claude, no AI attribution, no stray .git touch', () => {
  if (fs.existsSync('CLAUDE.md') || fs.existsSync('.claude')) throw new Error('forbidden file');
  const bad = [];
  for (const f of walk('.', SKIP)) { if (/package-lock\.json$|\.png$|\.jpe?g$|\.jpeg$|ref-bigrams\.json$|gates\.mjs$/.test(f)) continue; const t = read(f); if (/claude|anthropic|co-authored|generated (by|with)|\bchatgpt\b|\bopenai\b/i.test(t) || /\bAI\b/.test(t)) bad.push(f); }
  if (bad.length) throw new Error(bad.join(', '));
});
gate('repo content: README, whitepaper and MIT license present, outside dist/', () => {
  const r = read('README.md'), w = read('docs/whitepaper.md'), l = read('LICENSE');
  for (const s of ['# Flash', 'img.shields.io', 'Solana', 'Contract address', '## Overview', '## Features', '## Links']) if (!r.includes(s)) throw new Error('README lacks ' + s);
  const ph = (w.match(/\*\*Phase \d/g) || []).length; if (ph < 3 || ph > 4) throw new Error('whitepaper phases ' + ph);
  for (const s of ['Vision', 'Mission', 'Tokenomics', 'Team']) if (!w.includes(s)) throw new Error('whitepaper lacks ' + s);
  if (!/MIT License/.test(l) || !/Copyright \(c\) 2026 Flash/.test(l)) throw new Error('license text');
});

let pass = 0; const fails = [];
for (const [name, fn] of gates) {
  if (only && !name.includes(only)) continue;
  try { await fn(); pass++; console.log('PASS  ' + name); } catch (e) { fails.push(name); console.log('FAIL  ' + name + '\n        ' + String(e.message).split('\n').slice(0, 4).join('\n        ')); }
}
console.log(`\nGATES: ${pass}/${gates.length} passed`);
process.exit(fails.length ? 1 : 0);

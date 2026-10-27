// Live market board. Follows the market register record only; contract state has no effect here.
import { countUp, flash } from './motion.js';
import { copyText } from './copy.js';

const REG = JSON.parse(document.getElementById('register').textContent).records;
const rec = REG.market;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DASH = '—';

const fmtUsd = (n) => {
  if (n == null || !isFinite(n)) return DASH;
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
};
const fmtPrice = (p) => {
  if (p == null || !isFinite(p) || p <= 0) return DASH;
  if (p >= 1) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 0.01) return '$' + p.toFixed(4);
  return '$' + p.toFixed(Math.min(10, 2 - Math.floor(Math.log10(p))));
};
const fmtChg = (c) => (c == null || !isFinite(c) ? DASH : (c > 0 ? '+' : '') + c.toFixed(1) + '%');

const state = { items: [], good: false, sort: 'volume', timer: 0, busy: false };
const rowsEl = $('[data-rows]');
const rowMap = new Map();
const errEl = $('[data-board-err]');

const setStatus = (s, text) => $$('[data-pill]').forEach((p) => { p.dataset.state = s; $('[data-pill-text]', p).textContent = text; });
const showErr = (msg) => { errEl.hidden = !msg; errEl.textContent = msg || ''; };

async function getJSON(url) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}

// exponential backoff inside one refresh cycle: 1s, 2s, 4s, 8s
async function withBackoff(fn, tries = 4) {
  let d = 1000;
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries - 1) throw e;
      setStatus('retry', 'Retrying the feed');
      await sleep(d); d = Math.min(d * 2, 30000);
    }
  }
}

async function pull() {
  const boosts = await getJSON(rec.url);
  const sol = (Array.isArray(boosts) ? boosts : []).filter((b) => b && b.chainId === 'solana' && b.tokenAddress);
  const addrs = [...new Set(sol.map((b) => b.tokenAddress))].slice(0, 30);
  if (!addrs.length) throw new Error('no solana entries');
  const pairs = await getJSON(rec.pairs.replace('{addresses}', addrs.map(encodeURIComponent).join(',')));
  if (!Array.isArray(pairs)) throw new Error('bad pairs');
  const want = new Set(addrs);
  const best = new Map();
  for (const p of pairs) {
    const a = p && p.baseToken && p.baseToken.address;
    if (!a || !want.has(a)) continue;
    const liq = (p.liquidity && p.liquidity.usd) || 0;
    const cur = best.get(a);
    if (!cur || liq > ((cur.liquidity && cur.liquidity.usd) || 0)) best.set(a, p);
  }
  const items = [...best.entries()].map(([addr, p]) => ({
    addr,
    symbol: String(p.baseToken.symbol || '?').slice(0, 12),
    name: String(p.baseToken.name || '').slice(0, 40),
    img: p.info && typeof p.info.imageUrl === 'string' && /^https:\/\//.test(p.info.imageUrl) ? p.info.imageUrl : null,
    price: p.priceUsd != null ? Number(p.priceUsd) : null,
    change: p.priceChange && p.priceChange.h24 != null ? Number(p.priceChange.h24) : null,
    vol: p.volume && p.volume.h24 != null ? Number(p.volume.h24) : null,
    liq: p.liquidity && p.liquidity.usd != null ? Number(p.liquidity.usd) : null,
  }));
  if (!items.length) throw new Error('no pairs');
  items.sort((a, b) => (b.vol || 0) - (a.vol || 0));
  return items.slice(0, 10);
}

// ---------- tiles: logo from imageUrl, letter tile when missing or broken ----------
function tile(it, cls = '') {
  const t = document.createElement('span');
  t.className = 'tile ' + cls;
  const letter = () => {
    t.classList.add('t' + (it.addr.charCodeAt(0) % 5));
    t.replaceChildren(document.createTextNode((it.symbol[0] || '?').toUpperCase()));
  };
  letter(); // letter shows first, the logo replaces it once it has loaded
  if (it.img) {
    const im = new Image();
    im.alt = ''; im.decoding = 'async'; im.referrerPolicy = 'no-referrer';
    im.onload = () => t.replaceChildren(im);
    im.onerror = letter;
    im.src = it.img;
  }
  return t;
}

const ICON_COPY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>';

function copyBtn(it) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'copy-btn';
  b.setAttribute('aria-label', 'Copy address of ' + it.symbol);
  b.innerHTML = ICON_COPY + '<span>Copy</span>';
  b.addEventListener('click', async () => {
    if (await copyText(it.addr)) {
      b.classList.add('done'); b.setAttribute('aria-label', 'Copied address of ' + it.symbol);
      setTimeout(() => { b.classList.remove('done'); b.setAttribute('aria-label', 'Copy address of ' + it.symbol); }, 1600);
    }
  });
  return b;
}

// ---------- numbers: count-up, flash on change ----------
function setNum(el, val, fmt, first) {
  const prev = el._v;
  el._v = val;
  if (val == null || !isFinite(val)) { el.textContent = DASH; el.classList.add('is-dash'); return; }
  el.classList.remove('is-dash');
  if (prev == null || !isFinite(prev)) { countUp(el, 0, val, fmt, first ? 1000 : 600); return; }
  if (prev !== val) { countUp(el, prev, val, fmt, 700); flash(el, val > prev ? 1 : -1); }
}

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function buildRow(it, i) {
  const li = mk('li', 'row in');
  li.dataset.spot = ''; li.dataset.addr = it.addr; li.style.setProperty('--i', i);
  const tok = mk('div', 'tok'), rk = mk('span', 'rk'), tt = mk('div', 'tok-t');
  tt.append(mk('b', '', it.symbol), mk('small', '', it.name || it.symbol));
  tok.append(rk, tile(it), tt);
  const px = mk('span', 'px'), chg = mk('span', 'chg'), vol = mk('span', 'vol'), liq = mk('span', 'liq'), cp = mk('span', 'cp');
  cp.append(copyBtn(it));
  li.append(tok, px, chg, vol, liq, cp);
  li._refs = { rk, px, chg, vol, liq };
  return li;
}

function order(items) {
  const k = {
    volume: (a, b) => (b.vol || 0) - (a.vol || 0),
    change: (a, b) => (b.change ?? -1e9) - (a.change ?? -1e9),
    liquidity: (a, b) => (b.liq || 0) - (a.liq || 0),
  }[state.sort];
  return [...items].sort(k);
}

function renderBoard(first) {
  $$('.row.skel, .row.ph', rowsEl).forEach((n) => n.remove());
  const list = order(state.items);
  const keep = new Set(list.map((i) => i.addr));
  for (const [a, el] of rowMap) if (!keep.has(a)) { el.remove(); rowMap.delete(a); }
  list.forEach((it, i) => {
    let li = rowMap.get(it.addr);
    if (!li) { li = buildRow(it, i); rowMap.set(it.addr, li); }
    li._refs.rk.textContent = String(i + 1);
    const chg = li._refs.chg;
    setNum(li._refs.px, it.price, fmtPrice, first);
    setNum(chg, it.change, fmtChg, first);
    chg.classList.toggle('up', it.change > 0); chg.classList.toggle('down', it.change < 0);
    setNum(li._refs.vol, it.vol, fmtUsd, first);
    setNum(li._refs.liq, it.liq, fmtUsd, first);
    rowsEl.appendChild(li); // appending in order re-sequences existing rows
  });
}

function renderMini() {
  const ul = $('[data-mini]');
  ul.replaceChildren(...state.items.slice(0, 5).map((it, i) => {
    const li = mk('li', 'mini-row in');
    li.style.setProperty('--i', i);
    const mid = mk('div');
    mid.append(mk('b', '', it.symbol), mk('span', 'sub', fmtUsd(it.vol) + ' vol'));
    const right = mk('div', 'r');
    right.append(mk('b', '', fmtPrice(it.price)), mk('span', 'sub ' + (it.change > 0 ? 'up' : it.change < 0 ? 'down' : ''), fmtChg(it.change)));
    li.append(tile(it, 'sm'), mid, right);
    return li;
  }));
}

function renderTicker() {
  const track = $('[data-ticker-track]');
  const one = (it) => {
    const s = mk('span', 'tick-item');
    s.append(mk('span', 'sym', it.symbol), mk('span', 'px', fmtPrice(it.price)), mk('span', it.change > 0 ? 'up' : it.change < 0 ? 'down' : '', fmtChg(it.change)));
    return s;
  };
  const a = state.items.map(one);
  const b = state.items.map(one); b.forEach((n) => n.setAttribute('aria-hidden', 'true'));
  track.replaceChildren(...a, ...b);
}

function renderStats() {
  const its = state.items;
  const total = its.reduce((s, i) => s + (i.vol || 0), 0);
  const mover = its.filter((i) => i.change != null).sort((a, b) => b.change - a.change)[0];
  const put = (sel, text) => $$(sel).forEach((n) => { n.textContent = text; });
  put('[data-stat="count"], [data-count-total]', String(its.length));
  put('[data-stat="volume"], [data-vol-total]', fmtUsd(total));
  put('[data-stat="top"]', mover ? mover.symbol + ' ' + fmtChg(mover.change) : DASH);
}

function placeholders() {
  // the source never answered: dashes, never invented numbers
  $$('.row.skel', rowsEl).forEach((n) => n.remove());
  if ($('.row.ph', rowsEl)) return;
  for (let i = 0; i < 10; i++) {
    const li = mk('li', 'row ph in');
    li.style.setProperty('--i', i);
    const tok = mk('div', 'tok');
    const tt = mk('div', 'tok-t'); tt.append(mk('b', '', DASH), mk('small', '', 'no reading'));
    tok.append(mk('span', 'rk', String(i + 1)), mk('span', 'tile t0', DASH), tt);
    li.append(tok, mk('span', 'px is-dash', DASH), mk('span', 'chg is-dash', DASH), mk('span', 'vol is-dash', DASH), mk('span', 'liq is-dash', DASH), mk('span', 'cp'));
    rowsEl.appendChild(li);
  }
  $$('[data-stat], [data-vol-total], [data-count-total]').forEach((n) => { n.textContent = DASH; });
}

async function refresh() {
  if (state.busy) return;
  state.busy = true;
  if (!state.good) setStatus('syncing', 'Syncing the board');
  try {
    const items = await withBackoff(pull);
    const first = !state.good;
    state.items = items; state.good = true;
    renderBoard(first); renderMini(); renderTicker(); renderStats();
    showErr('');
    setStatus('live', 'Board live');
  } catch (e) {
    if (state.good) { setStatus('down', 'Showing last reading'); showErr('The feed missed a beat. The last good reading stays on screen.'); }
    else { setStatus('down', 'Feed unreachable'); showErr('Could not reach the market feed. Every figure shows a dash until it answers.'); placeholders(); }
  } finally { state.busy = false; schedule(); }
}

function schedule() {
  clearTimeout(state.timer);
  if (document.hidden) return;
  state.timer = setTimeout(refresh, 60000);
}

export function initMarket() {
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
    state.sort = t.dataset.sort;
    if (state.good) renderBoard(false);
  }));
  if (rec.state !== 'stated') {
    setStatus('down', 'Feed pending');
    showErr('Market feed: pending.');
    placeholders();
    return;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(state.timer);
    else refresh(); // fetch immediately on return
  });
  refresh();
}

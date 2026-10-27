// Motion layer: damped-spring reveals, pointer + scroll parallax, spotlight, progress bar, count-up.
// With prefers-reduced-motion every effect resolves instantly and no loops are started.
export const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// damped harmonic oscillator, semi-implicit Euler at a fixed 1/240s step
export function spring({ from = 0, to = 1, stiffness = 170, damping = 20, mass = 1, delay = 0, onUpdate, onDone }) {
  if (reduced) { onUpdate(to); onDone && onDone(); return; }
  let x = from, v = 0, last = null, acc = 0;
  const dt = 1 / 240;
  const tick = (t) => {
    if (last === null) last = t;
    acc += Math.min(0.05, (t - last) / 1000); last = t;
    while (acc >= dt) { const a = (-stiffness * (x - to) - damping * v) / mass; v += a * dt; x += v * dt; acc -= dt; }
    onUpdate(x);
    if (Math.abs(x - to) < 0.0015 && Math.abs(v) < 0.01) { onUpdate(to); onDone && onDone(); return; }
    requestAnimationFrame(tick);
  };
  setTimeout(() => requestAnimationFrame(tick), delay);
}

export function initReveal() {
  const els = [...document.querySelectorAll('[data-reveal]')];
  const show = (el, i) => {
    const d = i * 80;
    spring({
      delay: d,
      onUpdate: (p) => { el.style.opacity = String(Math.max(0, Math.min(1, p * 1.25))); el.style.transform = `translate3d(0, ${(1 - p) * 28}px, 0) scale(${0.97 + 0.03 * p})`; },
      onDone: () => { el.style.transform = ''; el.style.opacity = ''; el.classList.add('shown'); },
    });
  };
  if (reduced || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('shown')); return; }
  const idx = new Map();
  els.forEach((el) => { const sib = [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal')); idx.set(el, Math.max(0, sib.indexOf(el))); });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); show(en.target, idx.get(en.target)); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((el) => io.observe(el));
}

export function initParallax() {
  const layers = [...document.querySelectorAll('[data-depth]')];
  if (reduced || !layers.length) return;
  let px = 0, py = 0, tx = 0, ty = 0, sy = 0, cur = 0, raf = 0;
  const hero = document.getElementById('hero');
  const loop = () => {
    raf = 0;
    px += (tx - px) * 0.08; py += (ty - py) * 0.08; cur += (sy - cur) * 0.12;
    for (const el of layers) {
      const d = parseFloat(el.dataset.depth);
      el.style.translate = `${(px * d * 320).toFixed(2)}px ${(py * d * 320 + cur * d * 0.9).toFixed(2)}px`;
    }
    if (Math.abs(tx - px) > 0.001 || Math.abs(ty - py) > 0.001 || Math.abs(sy - cur) > 0.1) raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  window.addEventListener('pointermove', (e) => { tx = (e.clientX / innerWidth - 0.5) * 2; ty = (e.clientY / innerHeight - 0.5) * 2; kick(); }, { passive: true });
  window.addEventListener('scroll', () => { sy = Math.min(scrollY, hero ? hero.offsetHeight + 200 : 1200); kick(); }, { passive: true });
  kick();
}

export function initSpotlight() {
  if (reduced) return;
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('[data-spot]');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', `${e.clientX - r.left}px`);
    t.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}

export function initProgress() {
  const bar = document.querySelector('[data-progress]');
  if (!bar) return;
  let raf = 0;
  const upd = () => { raf = 0; const h = document.documentElement.scrollHeight - innerHeight; bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`; };
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
  window.addEventListener('resize', upd);
  upd();
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export function countUp(el, from, to, fmt, dur = 900) {
  if (el._cu) cancelAnimationFrame(el._cu);
  if (reduced || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = fmt(from + (to - from) * easeOut(k));
    if (k < 1) el._cu = requestAnimationFrame(step); else el.textContent = fmt(to);
  };
  el._cu = requestAnimationFrame(step);
}

export function flash(el, dir) {
  if (reduced) return;
  const c = dir > 0 ? 'flash-up' : 'flash-down';
  el.classList.remove('flash-up', 'flash-down');
  void el.offsetWidth;
  el.classList.add(c);
}

export function initFaq() {
  document.querySelectorAll('.q').forEach((b) => b.addEventListener('click', () => b.setAttribute('aria-expanded', b.getAttribute('aria-expanded') === 'true' ? 'false' : 'true')));
}

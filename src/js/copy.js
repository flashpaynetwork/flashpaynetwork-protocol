export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

export function initCaCopy() {
  const b = document.querySelector('button.ca[data-copy]');
  if (!b) return;
  const fb = b.querySelector('[data-fb]');
  let t = 0;
  b.addEventListener('click', async () => {
    const ok = await copyText(b.dataset.copy);
    fb.textContent = ok ? 'Copied' : 'Press and hold to copy';
    b.classList.toggle('copied', ok);
    clearTimeout(t);
    t = setTimeout(() => { fb.textContent = 'Copy'; b.classList.remove('copied'); }, 1800);
  });
}

// Register pattern: every external fact is one record with a state.
// Inert records (absent / unconfirmed) never carry a value or a url.
import fs from 'node:fs';

export const STATES = ['stated', 'absent', 'unconfirmed'];
export const IDS = ['ca', 'x', 'github', 'chain', 'market'];
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;

export function load(file = 'register.json') {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function validate(reg) {
  const errs = [];
  for (const id of IDS) {
    const r = reg.records?.[id];
    if (!r) { errs.push(`${id}: missing record`); continue; }
    if (!STATES.includes(r.state)) errs.push(`${id}: bad state ${r.state}`);
    if (!r.label) errs.push(`${id}: no label`);
    if (r.state !== 'stated') {
      for (const k of ['value', 'url', 'rpc', 'pairs']) if (k in r) errs.push(`${id}: inert record carries ${k}`);
    } else {
      if (id === 'ca' && !(B58.test(r.value || '') || EVM.test(r.value || ''))) errs.push('ca: stated value is not address-shaped');
      if ((id === 'x' || id === 'github') && !/^https:\/\//.test(r.url || '')) errs.push(`${id}: stated needs https url`);
      if (id === 'x' && !/^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/?$/.test(r.url || '')) errs.push('x: url is not a profile url');
      if (id === 'github' && !/^https:\/\/github\.com\/[A-Za-z0-9-]+(\/[A-Za-z0-9._-]+)?\/?$/.test(r.url || '')) errs.push('github: url is not a profile or repo url');
      if (id === 'chain' && !r.value) errs.push('chain: stated needs value');
      if (id === 'market' && !(r.url && r.pairs)) errs.push('market: stated needs url and pairs');
    }
  }
  return errs;
}

// handle is derived from the stored url, never stored
export function handle(rec) {
  if (rec.state !== 'stated' || !rec.url) return null;
  const parts = new URL(rec.url).pathname.split('/').filter(Boolean);
  return parts.length ? parts.join('/') : null;
}

// the slice of the register that is allowed to reach the page: no dates, no notes, no sources
export function runtime(reg) {
  const out = {};
  for (const [id, r] of Object.entries(reg.records)) {
    const o = { label: r.label, state: r.state };
    if (r.state === 'stated') for (const k of ['value', 'url', 'pairs']) if (r[k]) o[k] = r[k];
    out[id] = o;
  }
  return { records: out };
}

export const statedValues = (reg) => {
  const s = new Set();
  for (const r of Object.values(reg.records)) if (r.state === 'stated') for (const k of ['value', 'url', 'rpc', 'pairs']) if (r[k]) s.add(r[k]);
  return s;
};

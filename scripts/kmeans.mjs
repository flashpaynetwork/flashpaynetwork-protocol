// deterministic k-means (k-means++ seeding, fixed PRNG) over RGB pixels
export function kmeans(px, k, iters = 24) {
  let s = 1234567;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const n = px.length / 3, d2 = (i, c) => (px[i * 3] - c[0]) ** 2 + (px[i * 3 + 1] - c[1]) ** 2 + (px[i * 3 + 2] - c[2]) ** 2;
  const first = Math.floor(rnd() * n);
  const cs = [[px[first * 3], px[first * 3 + 1], px[first * 3 + 2]]];
  while (cs.length < k) {
    const dist = new Float64Array(n); let tot = 0;
    for (let i = 0; i < n; i++) { let m = 1e18; for (const c of cs) m = Math.min(m, d2(i, c)); dist[i] = m; tot += m; }
    let r = rnd() * tot, i = 0; while (i < n - 1 && (r -= dist[i]) > 0) i++;
    cs.push([px[i * 3], px[i * 3 + 1], px[i * 3 + 2]]);
  }
  let asg = new Int32Array(n);
  for (let it = 0; it < iters; it++) {
    const sum = cs.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      let b = 0, bd = 1e18;
      for (let j = 0; j < k; j++) { const d = d2(i, cs[j]); if (d < bd) { bd = d; b = j; } }
      asg[i] = b; const t = sum[b]; t[0] += px[i * 3]; t[1] += px[i * 3 + 1]; t[2] += px[i * 3 + 2]; t[3]++;
    }
    sum.forEach((t, j) => { if (t[3]) cs[j] = [t[0] / t[3], t[1] / t[3], t[2] / t[3]]; });
  }
  const count = new Array(k).fill(0); for (let i = 0; i < n; i++) count[asg[i]]++;
  // snap each centroid to the nearest real pixel (and report its coordinate index)
  const out = cs.map((c, j) => {
    let bi = -1, bd = 1e18;
    for (let i = 0; i < n; i++) if (asg[i] === j) { const d = d2(i, c); if (d < bd) { bd = d; bi = i; } }
    return { share: count[j] / n, rgb: bi < 0 ? c.map(Math.round) : [px[bi * 3], px[bi * 3 + 1], px[bi * 3 + 2]], idx: bi };
  });
  return out.sort((a, b) => b.share - a.share);
}
export const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

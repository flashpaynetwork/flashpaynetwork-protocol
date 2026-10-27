// Derives src/tokens.css from the supplied brand and reference images.
// Each token: k-means (k-means++ seeded, fixed PRNG) over a pixel region, centroid snapped to a real pixel.
import sharp from 'sharp';
import fs from 'node:fs';
import { kmeans, hex } from './kmeans.mjs';

const R = 'reference/', B = 'brand/';
const roles = [
  // name, file, region [x,y,w,h], k, pick(cluster list) -> cluster
  ['primary', B + 'LOGO FLASH PNG.png', [0, 0, 2000, 2000], 4, (c) => c.find((x) => x.rgb[2] > 200 && x.rgb[0] < 80)],
  ['paper', B + 'LOGO FLASH PNG.png', [0, 0, 2000, 2000], 4, (c) => c[0]],
  ['ink', R + 'FLASH 1.jpg.jpeg', [50, 195, 760, 165], 3, (c) => c.find((x) => x.rgb[0] < 60)],
  ['muted', R + 'FLASH 1.jpg.jpeg', [50, 380, 600, 120], 3, (c) => c.find((x) => x.rgb[0] > 100 && x.rgb[0] < 130)],
  ['tint', R + 'FLASH 1.jpg.jpeg', [1100, 600, 400, 250], 3, (c) => c[0]],
  ['tint-deep', R + 'FLASH 1.jpg.jpeg', [1100, 600, 400, 250], 3, (c) => c[2]],
  ['primary-soft', R + 'FLASH 1.jpg.jpeg', [1100, 600, 400, 250], 3, (c) => c[2]],
  ['line', R + 'FLASH 1.jpg.jpeg', [280, 826, 320, 50], 3, (c) => c[0]],
  ['up', R + 'FLASH 1.jpg.jpeg', [50, 832, 50, 44], 5, (c) => c.find((x) => x.rgb[0] < 90 && x.rgb[1] > 170)],
  ['violet', R + 'FLASH 1.jpg.jpeg', [50, 832, 50, 44], 5, (c) => c.find((x) => x.rgb[2] > 230 && x.rgb[1] < 120)],
  ['down', R + 'SAMPUL FLASH JPG.jpg.jpeg', [600, 0, 500, 100], 3, (c) => c.find((x) => x.rgb[0] > 200 && x.rgb[1] < 90)],
];
const cache = new Map();
const lines = [];
const tokens = {};
for (const [name, file, box, k, pick] of roles) {
  const key = file + box + k;
  if (!cache.has(key)) {
    const { data } = await sharp(file).extract({ left: box[0], top: box[1], width: box[2], height: box[3] }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    cache.set(key, { data, clusters: kmeans(data, k) });
  }
  const { data, clusters } = cache.get(key);
  const c = pick(clusters);
  if (!c) throw new Error('no cluster for ' + name);
  const x = box[0] + (c.idx % box[2]), y = box[1] + Math.floor(c.idx / box[2]);
  // verify the snapped value is a real pixel in the source image
  const px = await sharp(file).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  if (hex([...px]) !== hex(c.rgb)) throw new Error('snap mismatch for ' + name);
  tokens[name] = hex(c.rgb);
  lines.push(`  --c-${name}: ${hex(c.rgb)}; /* ${file} k=${k} region ${box.join(',')} share ${(c.share * 100).toFixed(0)}% px(${x},${y}) */`);
}
const css = `/* Written by scripts/palette.mjs. The only file in the project that holds colour literals. */
:root {
${lines.join('\n')}
  --c-primary-ink: color-mix(in srgb, var(--c-primary) 78%, var(--c-ink));
  --c-primary-a08: color-mix(in srgb, var(--c-primary) 8%, transparent);
  --c-primary-a16: color-mix(in srgb, var(--c-primary) 16%, transparent);
  --c-primary-a32: color-mix(in srgb, var(--c-primary) 32%, transparent);
  --c-ink-a06: color-mix(in srgb, var(--c-ink) 6%, transparent);
  --c-ink-a12: color-mix(in srgb, var(--c-ink) 12%, transparent);
  --c-ink-a40: color-mix(in srgb, var(--c-ink) 40%, transparent);
  --c-paper-a72: color-mix(in srgb, var(--c-paper) 72%, transparent);
  --c-up-a16: color-mix(in srgb, var(--c-up) 16%, transparent);
  --c-down-a16: color-mix(in srgb, var(--c-down) 16%, transparent);
  --c-violet-a16: color-mix(in srgb, var(--c-violet) 16%, transparent);
}
`;
fs.writeFileSync('src/tokens.css', css);
fs.writeFileSync('src/palette.json', JSON.stringify(tokens, null, 2));
console.log(tokens);

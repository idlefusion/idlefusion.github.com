#!/usr/bin/env node
// Writes a right-sized WebP beside every large PNG/JPEG in public/img.
// The build (integrations/optimized-images.mjs) then points <img> tags at the
// WebP, while the original stays in place for social previews and old links.
//
// Usage: npm run optimize:images [-- --force]
import { existsSync, statSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)), 'public/img');
const force = process.argv.includes('--force');

// Small files (logos, avatars) are already cheap; leave them alone.
const MIN_BYTES = 100_000;
// Measured: screenshots never render wider than ~1020 device pixels (390px phone
// at 3x, desktop at 2x) and icons never wider than ~670.
const maxWidth = (file) => (/icon/i.test(path.basename(file)) ? 640 : 1080);

let converted = 0;
let skipped = 0;
let before = 0;
let after = 0;
const seen = new Set();
for await (const relative of glob('**/*.{png,jpg,jpeg,PNG,JPG,JPEG}', { cwd: root })) {
  const file = path.join(root, relative);
  const { size, mtimeMs } = statSync(file);
  if (size < MIN_BYTES) continue;
  const output = file.replace(/\.(png|jpe?g)$/i, '.webp');
  if (seen.has(output)) throw new Error(`Two sources would write ${output}`);
  seen.add(output);
  if (!force && existsSync(output) && statSync(output).mtimeMs >= mtimeMs) {
    skipped++;
    continue;
  }
  // rotate() applies EXIF orientation; sharp drops all other metadata (GPS included).
  const info = await sharp(file)
    .rotate()
    .resize({ width: maxWidth(file), withoutEnlargement: true })
    .webp({ quality: 80, effort: 5 })
    .toFile(output);
  converted++;
  before += size;
  after += info.size;
}

const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
console.log(
  `[optimize-images] ${converted} converted (${mb(before)} → ${mb(after)}), ${skipped} already up to date.`,
);

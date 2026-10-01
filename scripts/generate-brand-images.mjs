#!/usr/bin/env node
// Generates the social preview cards (1200×630) and home-screen icons.
// Re-run after changing a project's name or summary in src/data/projects.ts.
//
// Usage: npm run generate:brand-images
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { projects } from '../src/data/projects.ts';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = (...parts) => path.join(root, 'public/img', ...parts);
const font = async (file) =>
  `data:font/woff2;base64,${(await readFile(path.join(root, 'src/assets/fonts', file))).toString('base64')}`;

const workSans = await font('work-sans-latin-wght-normal.woff2');
const crimsonItalic = await font('crimson-pro-latin-wght-italic.woff2');

const escape = (text) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The two overlapping rings from the site's wordmark.
const mark = (size, stroke, color) => `
  <svg width="${size}" height="${(size * 28) / 32}" viewBox="-1 -1 34 30" aria-hidden="true">
    <ellipse cx="11" cy="14" rx="10" ry="13" transform="rotate(32 11 14)" fill="none" stroke="${color}" stroke-width="${stroke}"/>
    <ellipse cx="21" cy="14" rx="10" ry="13" transform="rotate(32 21 14)" fill="none" stroke="${color}" stroke-width="${stroke}"/>
  </svg>`;

const card = ({ eyebrow, title, summary }) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Work Sans'; src: url(${workSans}) format('woff2'); font-weight: 100 900; }
  @font-face { font-family: 'Crimson Pro'; src: url(${crimsonItalic}) format('woff2'); font-style: italic; font-weight: 200 900; }
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; padding: 64px 76px; background: #ffffff; color: #0a0a0a;
    font-family: 'Work Sans', sans-serif; display: flex; flex-direction: column; justify-content: space-between;
    border-bottom: 14px solid #0088cc; }
  header { display: flex; align-items: center; justify-content: space-between; }
  .wordmark { display: flex; align-items: center; gap: 16px; font-size: 36px; font-weight: 650; letter-spacing: -1.6px; }
  .wordmark span { color: #0088cc; }
  .eyebrow { font-size: 18px; font-weight: 550; letter-spacing: 0.14em; text-transform: uppercase; color: #626262; }
  h1 { font-size: 92px; line-height: 1; font-weight: 500; letter-spacing: -0.055em; max-width: 1000px; }
  h1 em { font-family: 'Crimson Pro', serif; font-weight: 400; letter-spacing: -0.02em; color: #0088cc; }
  p { margin-top: 26px; font-size: 30px; line-height: 1.3; color: #626262; max-width: 900px; letter-spacing: -0.02em; }
  footer { font-size: 20px; color: #626262; }
</style></head><body>
  <header>
    <div class="wordmark">${mark(46, 2.2, '#0a0a0a')}<div>idle fusion<span>.</span></div></div>
    <div class="eyebrow">${escape(eyebrow)}</div>
  </header>
  <main><h1>${title}</h1>${summary ? `<p>${escape(summary)}</p>` : ''}</main>
  <footer>idlefusion.com</footer>
</body></html>`;

const cards = [
  {
    file: 'default.png',
    eyebrow: 'Independent app & web studio',
    title: 'Good ideas.<br>Built to <em>work.</em>',
    summary:
      'Thoughtful iOS apps and websites for Disney, NBC Sports, Golf Channel and independent teams.',
  },
  ...projects.map((project) => ({
    file: `work-${project.slug}.png`,
    eyebrow: `Selected work / ${project.number}`,
    title: `${escape(project.name)}<em>.</em>`,
    summary: project.short,
  })),
];

await mkdir(out('og'), { recursive: true });
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  for (const { file, ...content } of cards) {
    await page.setContent(card(content), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: 'png' });
    await sharp(png).png({ palette: true, quality: 90, effort: 10 }).toFile(out('og', file));
  }
} finally {
  await browser.close();
}

// Home-screen icons: the rings centred inside the maskable safe zone.
const icon = (size) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="#ffffff"/>
    <g transform="translate(26 29) scale(1.5)">
      <ellipse cx="11" cy="14" rx="10" ry="13" transform="rotate(32 11 14)" fill="none" stroke="#0088cc" stroke-width="2.2"/>
      <ellipse cx="21" cy="14" rx="10" ry="13" transform="rotate(32 21 14)" fill="none" stroke="#0088cc" stroke-width="2.2"/>
    </g>
  </svg>`);
await mkdir(out('icons'), { recursive: true });
for (const [file, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  await sharp(icon(size)).png({ palette: true }).toFile(out('icons', file));
}

console.log(
  `[generate-brand-images] ${cards.length} social cards and 3 icons written to public/img.`,
);

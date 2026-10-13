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
const image = async (file, type) =>
  `data:${type};base64,${(await readFile(path.join(root, 'public/img', file))).toString('base64')}`;
const paper = await image('paint/paper.webp', 'image/webp');
const swatch = await image('paint/swatch-rose.webp', 'image/webp');

const escape = (text) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The two overlapping rings from the site's wordmark.
const mark = (size, stroke, color) => `
  <svg width="${size}" height="${(size * 28) / 32}" viewBox="-1 -1 34 30" aria-hidden="true">
    <ellipse cx="11" cy="14" rx="10" ry="13" transform="rotate(32 11 14)" fill="none" stroke="${color}" stroke-width="${stroke}"/>
    <ellipse cx="21" cy="14" rx="10" ry="13" transform="rotate(32 21 14)" fill="none" stroke="${color}" stroke-width="${stroke}"/>
  </svg>`;

// Paper, ink, and one painting: the same language as the site (scripts/watercolor).
const card = ({ eyebrow, title, summary, art, wide = false }) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Work Sans'; src: url(${workSans}) format('woff2'); font-weight: 100 900; }
  @font-face { font-family: 'Crimson Pro'; src: url(${crimsonItalic}) format('woff2'); font-style: italic; font-weight: 200 900; }
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; padding: 56px 64px; background: #f5f0e6 url(${paper}) repeat; background-size: 320px;
    color: #171512; font-family: 'Work Sans', sans-serif; display: flex; flex-direction: column; justify-content: space-between;
    position: relative; overflow: hidden; }
  .art { position: absolute; right: -40px; top: 50%; width: 600px; transform: translateY(-50%); mix-blend-mode: multiply; }
  .art.wide { width: 700px; right: -70px; }
  h1 .dot { color: #d23f68; }
  header, main, footer { position: relative; }
  header { display: flex; align-items: center; gap: 14px; font-size: 32px; font-weight: 650; letter-spacing: -1.6px; }
  header span { color: #d23f68; }
  .eyebrow { font-family: ui-monospace, Menlo, monospace; font-size: 17px; letter-spacing: 0.08em; text-transform: uppercase; color: #5a544c; margin-bottom: 22px; }
  h1 { font-size: 80px; line-height: 0.98; font-weight: 500; letter-spacing: -0.05em; max-width: 680px; }
  h1 em { font-family: 'Crimson Pro', serif; font-weight: 400; letter-spacing: -0.015em; padding: 0 0.06em;
    background: url(${swatch}) no-repeat 0 92% / 100% 0.6em; }
  p { margin-top: 22px; font-size: 26px; line-height: 1.3; color: #5a544c; max-width: 620px; letter-spacing: -0.02em; }
  footer { font-family: ui-monospace, Menlo, monospace; font-size: 16px; letter-spacing: 0.08em; text-transform: uppercase; color: #5a544c;
    border-top: 1px solid rgba(23,21,18,.85); padding-top: 16px; width: 640px; }
</style></head><body>
  <img class="art${wide ? ' wide' : ''}" src="${art}">
  <header>${mark(42, 2.2, '#171512')}<div>idle fusion<span>.</span></div></header>
  <main><div class="eyebrow">${escape(eyebrow)}</div><h1>${title}</h1>${summary ? `<p>${escape(summary)}</p>` : ''}</main>
  <footer>idlefusion.com</footer>
</body></html>`;

const cards = [
  {
    file: 'default.png',
    eyebrow: 'Independent app & web studio',
    title: 'Apps & websites, from first sketch to <em>shipped.</em>',
    summary: '',
    art: await image('paint/fusion-mark.webp', 'image/webp'),
  },
  ...(await Promise.all(
    projects.map(async (project) => ({
      file: `work-${project.slug}.png`,
      eyebrow: `Selected work / ${project.number}`,
      title: `${escape(project.name)}<span class="dot">.</span>`,
      wide: true,
      summary: project.short,
      art: await image(project.art.replace(/^\/img\//, ''), 'image/webp'),
    })),
  )),
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
    // Full colour: a 256-colour palette bands the watercolour washes.
    await sharp(png).png({ compressionLevel: 9, effort: 10 }).toFile(out('og', file));
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

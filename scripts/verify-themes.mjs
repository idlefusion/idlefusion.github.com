// Every public page in both themes (the site follows prefers-color-scheme):
// the right paper, each painting's day or night file with its blend mode, and
// text contrast (WCAG AA: 4.5:1, or 3:1 for large type). Text set on paint
// (closing calls to action, highlighter strokes), logotypes, and aria-hidden
// marks are left to the screenshot review.
import puppeteer from 'puppeteer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appPages } from '../src/data/apps.ts';
import { projects } from '../src/data/projects.ts';

const origin = process.env.SITE_ORIGIN || 'http://127.0.0.1:4323';
const routes = [
  '/',
  '/work/',
  '/services/',
  '/studio/',
  '/apps/',
  '/open-source/',
  '/contact/',
  '/contact/thanks/',
  '/404.html',
  ...projects.map((project) => `/work/${project.slug}/`),
  ...appPages.flatMap((app) => [
    app.route,
    ...(app.hasPolicies ? [`${app.route}support/`, `${app.route}privacy/`] : []),
  ]),
];
const themes = {
  light: { paper: 'rgb(245, 240, 230)', blend: 'multiply', night: false },
  dark: { paper: 'rgb(24, 22, 19)', blend: 'screen', night: true },
};

function inspect(theme) {
  const parse = (value) => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const [r, g, b, a = 1] = match[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [r, g, b, a];
  };
  const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3]));
  const luminance = (rgb) =>
    rgb
      .map((c) => c / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const problems = [];
  const paper = getComputedStyle(document.body).backgroundColor;
  if (paper !== theme.paper) problems.push(`paper is ${paper}`);
  for (const image of document.querySelectorAll('img.paint')) {
    const name = image.getAttribute('src');
    if (!image.complete || !image.naturalWidth) problems.push(`${name} did not load`);
    if (image.currentSrc.includes('/night/') !== theme.night)
      problems.push(`${name} shows ${image.currentSrc}`);
    if (getComputedStyle(image).mixBlendMode !== theme.blend)
      problems.push(`${name} blends with ${getComputedStyle(image).mixBlendMode}`);
  }
  const skip =
    'svg, script, style, [aria-hidden="true"], .sr-only, .cta-paint, .app-cta, .hand, .wordmark, .footer-word';
  const seen = new Set();
  for (const element of document.querySelectorAll('body *')) {
    if (element.closest(skip)) continue;
    if (![...element.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    if (style.visibility !== 'visible' || box.width < 2 || box.height < 2) continue;
    // The background is every ancestor's colour, down to the first opaque one.
    const layers = [];
    let opacity = 1;
    for (let node = element; node; node = node.parentElement) {
      const nodeStyle = getComputedStyle(node);
      opacity *= Number(nodeStyle.opacity);
      const colour = parse(nodeStyle.backgroundColor);
      if (colour && colour[3] > 0) {
        layers.push(colour);
        if (colour[3] >= 0.999) break;
      }
    }
    const background = layers
      .reverse()
      .reduce((under, layer) => over(layer, under), [255, 255, 255]);
    const text = parse(style.color);
    const foreground = over([text[0], text[1], text[2], text[3] * opacity], background);
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    const ratio = contrast(foreground, background);
    const key = `${style.color} on ${background.map(Math.round)}`;
    if (ratio < (large ? 3 : 4.5) && !seen.has(key)) {
      seen.add(key);
      problems.push(`“${element.textContent.trim().slice(0, 32)}” ${ratio.toFixed(2)}:1 (${key})`);
    }
  }
  return problems;
}

const browser = await puppeteer.launch({ headless: true });
const failures = [];
const queue = Object.keys(themes).flatMap((theme) => routes.map((route) => ({ route, theme })));
async function worker() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => failures.push(`${page.url()}: ${error}`));
  for (let job = queue.shift(); job; job = queue.shift()) {
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: job.theme },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    await page.goto(`${origin}${job.route}`, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (const image of document.images) image.loading = 'eager';
      // A painting that never arrives is reported below rather than waited on.
      await Promise.race([
        Promise.all(
          [...document.images].map((image) =>
            image.complete
              ? null
              : new Promise((resolve) => {
                  image.addEventListener('load', resolve, { once: true });
                  image.addEventListener('error', resolve, { once: true });
                }),
          ),
        ),
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]);
    });
    const problems = await page.evaluate(inspect, themes[job.theme]);
    for (const problem of problems) failures.push(`${job.route} (${job.theme}): ${problem}`);
  }
  await page.close();
}
try {
  await Promise.all([worker(), worker(), worker()]);
} finally {
  await browser.close();
}
await mkdir('artifacts/redesign', { recursive: true });
await writeFile(
  path.join('artifacts/redesign', 'themes-audit.json'),
  JSON.stringify({ routes: routes.length, themes: Object.keys(themes), failures }, null, 2),
);
for (const failure of failures) console.log(`  ✗ ${failure}`);
console.log(
  `Themes: ${routes.length} pages in light and dark — paper, paintings, and text contrast. ${failures.length} failures.`,
);
if (failures.length) process.exitCode = 1;

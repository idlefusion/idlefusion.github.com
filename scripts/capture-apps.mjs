import puppeteer from 'puppeteer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appPages } from '../src/data/apps.ts';

const origin = process.env.SITE_ORIGIN || 'http://127.0.0.1:4323';
const out = path.resolve('artifacts/redesign/app-pages');
const baselineOrigin = process.env.APP_BASELINE_ORIGIN;
const reviewOrigin = process.env.REVIEW_ORIGIN || origin;
const requested = process.env.APP_REVIEW_ONLY?.split(',');
const targets = requested ? appPages.filter((app) => requested.includes(app.slug)) : appPages;
const audit = { pages: [], interactions: [], errors: [], localLinks: [] };
const links = new Set();
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true });

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const image of document.images) image.loading = 'eager';
    await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
  });
}
async function finishTransitions(page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
}
async function top(page) {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}
async function record(page, app, kind, theme, device, response) {
  await top(page);
  const checks = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    width: document.documentElement.scrollWidth,
    headings: document.querySelectorAll('h1').length,
    brokenImages: [...document.images]
      .filter((i) => !i.complete || !i.naturalWidth)
      .map((i) => i.getAttribute('src')),
    noindex: document.querySelector('meta[name="robots"]')?.content.includes('noindex'),
    homeLink: document.querySelector('.app-parent-brand')?.getAttribute('href'),
    directoryLink: document.querySelector('.app-directory-link')?.getAttribute('href'),
    policyLinks: [...document.querySelectorAll('.app-policy-nav a')].map((a) =>
      a.getAttribute('href'),
    ),
    links: [...document.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href'))
      .filter((href) => href.startsWith('/')),
    hashFailures: [...document.querySelectorAll('a[href^="#"]')]
      .filter((a) => a.hash && !document.getElementById(decodeURIComponent(a.hash.slice(1))))
      .map((a) => a.getAttribute('href')),
  }));
  checks.links.forEach((href) => links.add(href));
  delete checks.links;
  audit.pages.push({ slug: app.slug, kind, theme, device, status: response.status(), ...checks });
  await page.screenshot({
    path: path.join(out, `${app.slug}-${kind}-${theme}-${device}.png`),
    fullPage: true,
  });
  if (kind === 'landing' && theme === 'light' && device === 'desktop')
    await page.screenshot({ path: path.join(out, `${app.slug}-preview.png`) });
}

let nextIndex = 0;
async function worker() {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setCacheEnabled(false);
  page.on('pageerror', (error) => audit.errors.push(String(error)));
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  while (nextIndex < targets.length) {
    const app = targets[nextIndex++];
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    if (baselineOrigin) {
      // A separately served build from before this revision, for side-by-side review.
      await page.goto(`${baselineOrigin}${app.route}`, { waitUntil: 'networkidle0' });
      await settle(page);
      await finishTransitions(page);
      await top(page);
      await page.screenshot({ path: path.join(out, `${app.slug}-original.png`) });
    }
    let response = await page.goto(`${origin}${app.route}`, { waitUntil: 'networkidle0' });
    await settle(page);
    await finishTransitions(page);
    await record(page, app, 'landing', 'light', 'desktop', response);
    // Every landing page offers a real store badge or says plainly that it's coming soon.
    audit.interactions.push({
      slug: app.slug,
      name: 'Store badge or coming-soon label',
      passed: await page.evaluate(
        () =>
          !document.querySelector('a[href="#"] img[src*="store-badge"]') &&
          Boolean(
            document.querySelector('a.store-badge[href*="apps.apple.com"]') ||
            document.querySelector('.store-soon'),
          ),
      ),
    });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    response = await page.reload({ waitUntil: 'networkidle0' });
    await settle(page);
    await finishTransitions(page);
    await record(page, app, 'landing', 'light', 'mobile', response);
    if (app.hasPolicies) {
      for (const kind of ['support', 'privacy']) {
        for (const [device, width, height] of [
          ['desktop', 1440, 1000],
          ['mobile', 390, 844],
        ]) {
          await page.setViewport({ width, height, deviceScaleFactor: 1 });
          response = await page.goto(`${origin}${app.route}${kind}/`, {
            waitUntil: 'networkidle0',
          });
          await settle(page);
          await record(page, app, kind, 'light', device, response);
        }
      }
    }
    console.log(
      `Reviewed ${app.name}: desktop/mobile${app.hasPolicies ? ', support + privacy' : ''}`,
    );
  }
  await context.close();
}
try {
  await Promise.all([worker(), worker(), worker()]);
  for (const href of links) {
    const response = await fetch(`${origin}${href}`);
    audit.localLinks.push({ href, status: response.status });
  }
} finally {
  await browser.close();
}

audit.pages.sort((a, b) =>
  `${a.slug}-${a.kind}-${a.theme}-${a.device}`.localeCompare(
    `${b.slug}-${b.kind}-${b.theme}-${b.device}`,
  ),
);
const failures = audit.pages.filter(
  (p) =>
    p.status !== 200 ||
    p.overflow ||
    p.headings !== 1 ||
    p.brokenImages.length ||
    p.noindex ||
    p.homeLink !== '/' ||
    p.directoryLink !== '/apps/' ||
    p.hashFailures.length,
);
await writeFile(
  path.join(out, requested ? 'audit-targeted.json' : 'audit.json'),
  JSON.stringify(audit, null, 2),
);
const failed =
  failures.length +
  audit.interactions.filter((i) => !i.passed).length +
  audit.localLinks.filter((l) => l.status !== 200).length +
  audit.errors.length;
console.log(
  JSON.stringify(
    {
      pageChecks: audit.pages.length,
      interactions: audit.interactions.length,
      localLinks: audit.localLinks.length,
      failures: failed,
      failedPages: failures.map(
        ({ slug, kind, theme, device, overflow, brokenImages, hashFailures }) => ({
          slug,
          kind,
          theme,
          device,
          overflow,
          brokenImages,
          hashFailures,
        }),
      ),
      failedInteractions: audit.interactions.filter((i) => !i.passed),
    },
    null,
    2,
  ),
);
if (failed) process.exitCode = 1;

const gallery = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Idle Fusion — Dedicated app review</title><style>
*{box-sizing:border-box}body{margin:0;background:white;color:#0a0a0a;font-family:system-ui,sans-serif}header,main{max-width:1450px;margin:auto;padding:40px}header{border-bottom:1px solid #e4e4e4}small{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#006da3}h1{font-size:clamp(35px,5vw,64px);line-height:1.05;letter-spacing:-.055em;margin:20px 0}p{font-size:14px;color:#626262;line-height:1.65;max-width:820px}a{color:inherit;text-underline-offset:4px}.nav{display:flex;flex-wrap:wrap;gap:22px;font-size:13px;margin:25px 0}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:40px 25px}.preview{display:block;overflow:hidden;border:1px solid #ddd;border-radius:5px}.preview img{width:100%;display:block;aspect-ratio:1.44;object-fit:cover;object-position:top}h2{font-size:22px;letter-spacing:-.04em;margin:16px 0 8px}article p{margin:8px 0 16px;font-size:12px}article .links{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:12px;margin:12px 0}details{font-size:12px;border-top:1px solid #ddd;padding-top:12px;margin-top:16px}summary{cursor:pointer}summary:focus-visible,a:focus-visible{outline:2px solid #0088cc;outline-offset:4px}.badge{display:inline-block;font-size:10px;color:#666;padding:3px 7px;background:#f3f3f3;border-radius:3px}aside{background:#f3f3f3;border-radius:5px;padding:20px;margin-top:25px;font-size:13px;line-height:1.7}@media(max-width:950px){.grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){header,main{padding:25px}.grid{grid-template-columns:1fr}}
</style></head><body><header><small>Idle Fusion / App design review</small><h1>One studio.<br>Every app in its colors.</h1><p>All 28 dedicated app pages and the currency-app family use the studio’s design: paper, ink, and the Idle Fusion mark painted in each app’s own pigments. Icons and screenshots are shown exactly as supplied; the copy is carried over unchanged.</p><div class="nav"><a href="../">Business-site screenshots ←</a><a href="${reviewOrigin}/apps/">Explore the updated app directory ↗</a></div><aside>Full desktop and phone screenshots are available for every page. ${baselineOrigin ? 'The original desktop view is included for comparison.' : ''} Each app’s support and privacy screenshots are under “Support & privacy.” Marta Easy and the currency family remain hidden from the public app directory. Launch-status labels and store destinations follow the existing local metadata; external release status has not been re-verified.</aside></header><main><div class="grid">${appPages.map((app) => `<article id="${app.slug}"><a class="preview" href="${app.slug}-landing-light-desktop.png"><img src="${app.slug}-preview.png" alt="${app.name} landing page" loading="lazy"></a><h2>${app.name}</h2><small>${app.category}</small>${app.hidden ? ' <span class="badge">Hidden from app directory</span>' : ''}<p>Icon and screenshots as supplied, in the studio’s design.</p><div class="links"><a href="${app.slug}-landing-light-desktop.png">Desktop ↗</a><a href="${app.slug}-landing-light-mobile.png">Phone ↗</a></div><div class="links">${baselineOrigin ? `<a href="${app.slug}-original.png">Original view ↗</a>` : ''}<a href="${reviewOrigin}${app.route}">Working page ↗</a></div>${app.hasPolicies ? `<details><summary>Support & privacy</summary>${['support', 'privacy'].map((kind) => `<div class="links"><strong>${kind === 'support' ? 'Support' : 'Privacy'}</strong><a href="${app.slug}-${kind}-light-desktop.png">Desktop ↗</a><a href="${app.slug}-${kind}-light-mobile.png">Phone ↗</a><a href="${reviewOrigin}${app.route}${kind}/">Live page ↗</a></div>`).join('')}</details>` : ''}</article>`).join('')}</div></main></body></html>`;
await writeFile(path.join(out, 'index.html'), gallery);

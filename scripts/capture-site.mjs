import puppeteer from 'puppeteer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const origin = process.env.SITE_ORIGIN || 'http://127.0.0.1:4323';
const reviewOrigin = process.env.REVIEW_ORIGIN || origin;
const out = path.resolve('artifacts/redesign');
const pages = [
  [
    'welcome',
    'Welcome',
    '',
    'A quiet introduction, contact details, and an invitation into the full site.',
  ],
  ['home', 'Explore', 'explore/', 'Featured work, services, and a personal connection.'],
  ['work', 'Work', 'work/', 'A dedicated portfolio with mobile and web filters.'],
  [
    'services',
    'Services',
    'services/',
    'Three clear practices and a transparent, three-step process.',
  ],
  ['studio', 'Studio', 'studio/', 'A founder-led story with a direct, approachable voice.'],
  ['apps', 'Apps', 'apps/', 'The existing app collection, with search and category filters.'],
  [
    'open-source',
    'Open source',
    'open-source/',
    'A focused introduction to the tools you share with developers.',
  ],
  [
    'contact',
    'Contact',
    'contact/',
    'A welcoming inquiry flow using the original direct-send contact service.',
  ],
  [
    'contrast',
    'Contrast app',
    'contrast/',
    'The original orange/cyan app identity, with shared Idle Fusion navigation.',
  ],
  [
    'everybody-everywhere',
    'Everybody Everywhere',
    'work/everybody-everywhere/',
    'Case study: community and impact.',
  ],
  [
    'radio-disney',
    'Radio Disney',
    'work/radio-disney/',
    'Case study: media and entertainment, with an archive note.',
  ],
  [
    'golf-channel-academy',
    'Golf Channel Academy',
    'work/golf-channel-academy/',
    'Case study: sports and learning.',
  ],
  [
    'easy-digital-downloads',
    'Easy Digital Downloads',
    'work/easy-digital-downloads/',
    'Case study: commerce and platforms.',
  ],
  [
    'golf-channel',
    'Golf Channel Mobile',
    'work/golf-channel/',
    'Case study: sports and broadcasting.',
  ],
];
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true });
const audit = { pages: [], interactions: [], internalLinks: [], errors: [] };
try {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  page.on('pageerror', (e) => audit.errors.push(String(e)));
  const links = new Set();
  for (const [id, title, route] of pages) {
    for (const [device, width, height] of [
      ['desktop', 1440, 1000],
      ['mobile', 390, 844],
    ]) {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      const response = await page.goto(`${origin}/${route}`, { waitUntil: 'networkidle0' });
      await page.evaluate(async () => {
        await document.fonts.ready;
        for (const img of document.images) {
          img.loading = 'eager';
        }
        await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => {})));
      });
      const state = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        width: document.documentElement.scrollWidth,
        h1: document.querySelectorAll('h1').length,
        brokenImages: Array.from(document.images)
          .filter((i) => !i.complete || !i.naturalWidth)
          .map((i) => i.src),
        links: Array.from(document.querySelectorAll('a[href]'))
          .map((a) => a.getAttribute('href'))
          .filter((h) => h.startsWith('/')),
        noindex: document.querySelector('meta[name="robots"]')?.content,
      }));
      state.links.forEach((l) => links.add(l));
      const { links: unused, ...checks } = state;
      audit.pages.push({ id, title, device, status: response.status(), ...checks });
      await page.screenshot({ path: path.join(out, `${id}-${device}.png`), fullPage: true });
      if (device === 'desktop')
        await page.screenshot({ path: path.join(out, `${id}-preview.png`), fullPage: false });
    }
    console.log(`Captured ${title}: desktop + mobile`);
  }
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(`${origin}/explore/`);
  await page.click('.mobile-nav summary');
  audit.interactions.push({
    name: 'Mobile navigation opens',
    passed: await page.$eval('.mobile-nav', (el) => el.open),
  });
  await page.click('.mobile-nav a[href="/services/"]');
  await page.waitForFunction(() => location.pathname === '/services/');
  audit.interactions.push({ name: 'Mobile navigation follows links', passed: true });
  await page.goto(`${origin}/work/`);
  await page.click('[data-filter="Web"]');
  audit.interactions.push({
    name: 'Web filter shows one matching project',
    passed: await page.$$eval(
      '.project-card',
      (els) =>
        els.filter((el) => !el.hidden).length === 1 &&
        els.filter((el) => !el.hidden)[0].dataset.category === 'Web',
    ),
  });
  await page.click('[data-filter="All"]');
  audit.interactions.push({
    name: 'All-work filter restores five projects',
    passed: await page.$$eval(
      '.project-card',
      (els) => els.filter((el) => !el.hidden).length === 5,
    ),
  });
  await page.goto(`${origin}/apps/`);
  await page.click('[data-app-filter="Focus"]');
  audit.interactions.push({
    name: 'Focus category filters apps',
    passed: await page.$$eval('.app-tile', (els) => els.filter((el) => !el.hidden).length === 4),
  });
  await page.click('[data-app-filter="All"]');
  await page.type('#app-search', 'Contrast');
  audit.interactions.push({
    name: 'App search finds Contrast',
    passed: await page.$$eval(
      '.app-tile',
      (els) =>
        els.filter((el) => !el.hidden).length === 1 &&
        els.filter((el) => !el.hidden)[0].textContent.includes('Contrast'),
    ),
  });
  await page.type('#app-search', ' no-match');
  audit.interactions.push({
    name: 'Empty search explains no results',
    passed: await page.$eval('#app-empty', (el) => !el.hidden),
  });
  let contactRequest;
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/contact') {
      contactRequest = { method: request.method(), data: JSON.parse(request.postData()) };
      return request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    }
    return request.continue();
  });
  await page.goto(`${origin}/contact/`);
  await page.click('button[type="submit"]');
  audit.interactions.push({
    name: 'Empty contact form fails validation',
    passed:
      (await page.$eval('#contact-form', (el) => !el.checkValidity())) &&
      (await page.$eval('#form-success', (el) => el.hidden)),
  });
  await page.type('[name="name"]', 'Preview Reviewer');
  await page.type('[name="email"]', 'reviewer@example.com');
  await page.type('[name="message"]', 'An example project inquiry for local preview.');
  await page.click('button[type="submit"]');
  await page.waitForSelector('#form-success:not([hidden])');
  audit.interactions.push({
    name: 'Valid form submits to the original contact API and confirms success',
    passed:
      contactRequest?.method === 'POST' &&
      contactRequest.data.name === 'Preview Reviewer' &&
      contactRequest.data._honeypot === '' &&
      (await page.$eval('[name="message"]', (el) => el.value === '')),
  });
  for (const href of links) {
    const result = await page.evaluate(async (href) => {
      const res = await fetch(href);
      return { href, status: res.status };
    }, href);
    audit.internalLinks.push(result);
  }
  await writeFile(path.join(out, 'audit.json'), JSON.stringify(audit, null, 2));
  const failed =
    audit.pages.filter(
      (p) =>
        p.status !== 200 ||
        p.overflow ||
        p.h1 !== 1 ||
        p.brokenImages.length ||
        !p.noindex?.includes('index, follow'),
    ).length +
    audit.interactions.filter((i) => !i.passed).length +
    audit.internalLinks.filter((l) => l.status !== 200).length +
    audit.errors.length;
  console.log(
    `Verification: ${audit.pages.length} page/viewport checks, ${audit.interactions.length} interactions, ${audit.internalLinks.length} local links. ${failed} failures.`,
  );
  if (failed) process.exitCode = 1;
} finally {
  await browser.close();
}

await writeFile(
  path.join(out, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Idle Fusion — Website review</title><style>
*{box-sizing:border-box}body{margin:0;background:#ffffff;color:#0a0a0a;font-family:system-ui,sans-serif}header,main{max-width:1400px;margin:auto;padding:40px}header{border-bottom:1px solid #e4e4e4}small{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#006da3}h1{font-size:clamp(32px,5vw,62px);letter-spacing:-.05em;margin:20px 0}p{max-width:780px;color:#626262;line-height:1.6}a{color:inherit;text-underline-offset:5px}header>a{display:inline-block;margin-top:15px;padding:13px 20px;background:#0a0a0a;color:white;border-radius:5px;text-decoration:none}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:35px 25px}article{min-width:0}article>a{display:block;border:1px solid #e4e4e4;border-radius:5px;overflow:hidden;background:#f5f5f5}img{display:block;width:100%;height:auto;aspect-ratio:1.44;object-fit:cover;object-position:top}h2{font-size:20px;letter-spacing:-.03em;margin:17px 0 8px}article p{font-size:13px;min-height:44px;margin:0 0 16px}.links{display:flex;gap:18px;font-size:12px;flex-wrap:wrap}aside{padding:25px;background:#f5f5f5;border-radius:5px;margin-top:30px;font-size:13px;line-height:1.7}.palette{display:flex;gap:20px;flex-wrap:wrap;margin:22px 0}.swatch{display:flex;align-items:center;gap:7px;font-size:12px}.swatch i{width:20px;height:20px;border:1px solid #0002;border-radius:50%}@media(max-width:950px){.grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){header,main{padding:25px}.grid{grid-template-columns:1fr}}
</style></head><body><header><small>Idle Fusion / Release review</small><h1>A thoughtful studio.<br>A clearer digital presence.</h1><p>The original blue, black, and white palette, with the reviewed layout and typography. Business-site pages are shown below. The dedicated app gallery covers all 28 app pages, the currency family, and their support and privacy pages. Click any image to view its full-page screenshot.</p><div class="palette"><span class="swatch"><i style="background:#ffffff"></i>White</span><span class="swatch"><i style="background:#0a0a0a"></i>Black</span><span class="swatch"><i style="background:#0088cc"></i>Brand blue</span><span class="swatch"><i style="background:#e8f5fc"></i>Ice blue</span></div><a href="${reviewOrigin}/">Explore the updated site ↗</a> <a href="app-pages/">Review all dedicated app pages ↗</a><aside><strong>Release scope:</strong> Home, Work, Services, Studio, Apps, Open source, Contact, the original Contrast design with shared navigation, and all five existing case studies. All dedicated app designs are preserved and included in the separate app gallery, along with support and privacy previews. Developer documentation remains the existing page. Contact uses the original direct-send service; automated checks simulate delivery without sending email. This review is generated locally.</aside></header><main><div class="grid">${pages.map(([id, title, route, description], i) => `<article><a href="${id}-desktop.png" aria-label="Full desktop screenshot of ${title}"><img src="${id}-preview.png" alt="${title} redesign screenshot" loading="lazy"></a><h2>${String(i + 1).padStart(2, '0')} / ${title}</h2><p>${description}</p><div class="links"><a href="${id}-desktop.png">Full desktop ↗</a><a href="${id}-mobile.png">Full mobile ↗</a><a href="${reviewOrigin}/${route}">Live page ↗</a></div></article>`).join('')}</div></main></body></html>`,
);

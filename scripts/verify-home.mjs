// The business home page lives at /. Old addresses (/explore/, /welcome/, and
// section links into either) must still land on the right content.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const origin = process.env.SITE_ORIGIN || 'http://127.0.0.1:4323';
const browser = await puppeteer.launch({ headless: true });
const checks = [];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  const response = await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
  assert.equal(response.status(), 200);
  const home = await page.evaluate(() => ({
    h1: document.querySelectorAll('h1').length,
    hero: Boolean(document.querySelector('.hero-copy')),
    cta: document.querySelector('[data-track="cta_hero"]')?.getAttribute('href'),
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    homeLink: document.querySelector('.wordmark')?.getAttribute('href'),
  }));
  assert.deepEqual(home, {
    h1: 1,
    hero: true,
    cta: '/contact/',
    canonical: 'https://idlefusion.com/',
    homeLink: '/',
  });
  checks.push('Home page is served at / with its hero, call to action, and canonical URL');

  for (const hash of ['#our-work', '#how-it-works', '#leadership']) {
    assert.ok(await page.$(hash), `missing ${hash} on /`);
    await page.goto(`${origin}/explore/${hash}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => location.pathname === '/');
    assert.equal(new URL(page.url()).hash, hash);
  }
  checks.push('Old /explore/ section links land on the same sections at /');

  await page.goto(`${origin}/welcome/`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => location.pathname === '/');
  checks.push('/welcome/ still reaches the home page');

  assert.deepEqual(errors, []);
  console.log(`Home: ${checks.length} checks passed.`);
} finally {
  await browser.close();
}

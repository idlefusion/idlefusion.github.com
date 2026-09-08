import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';

const origin = process.env.SITE_ORIGIN || 'http://127.0.0.1:4323';
const output = 'artifacts/redesign/soft-landing';
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ headless: true });
const checks = [];
try {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  for (const [device, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
    ['small-phone', 320, 568],
  ]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    for (const appearance of ['light', 'dark']) {
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: appearance }]);
      const response = await page.goto(origin, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(response.status(), 200);
      assert.equal(await theme(), appearance);
      const state = await page.evaluate(() => ({
        background: getComputedStyle(document.body).backgroundColor,
        overflow: document.documentElement.scrollWidth > innerWidth,
        headings: document.querySelectorAll('h1').length,
        email: document.querySelector('.email').getAttribute('href'),
        entry: document.querySelector('.enter').getAttribute('href'),
        toggleLabel: document.querySelector('#appearance-toggle').getAttribute('aria-label'),
      }));
      assert.equal(
        state.background,
        appearance === 'dark' ? 'rgb(16, 17, 20)' : 'rgb(255, 255, 255)',
      );
      assert.equal(state.overflow, false);
      assert.equal(state.headings, 1);
      assert.equal(state.email, 'mailto:hello@idlefusion.com');
      assert.equal(state.entry, '/explore/');
      assert.equal(state.toggleLabel, `Switch to ${appearance === 'dark' ? 'light' : 'dark'} mode`);
      await page.screenshot({ path: `${output}/${device}-${appearance}.png`, fullPage: true });
      checks.push(`${device}: ${appearance} appearance and links`);
    }
  }
  // An explicit choice takes priority over the OS and survives navigation/reload.
  await page.focus('#appearance-toggle');
  await page.keyboard.press('Enter');
  assert.equal(await theme(), 'light');
  assert.equal(await page.evaluate(() => localStorage.getItem('theme')), 'light');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await theme(), 'light');
  await page.click('.enter');
  await page.waitForSelector('.hero-copy');
  assert.equal(new URL(page.url()).pathname, '/explore/');
  await page.goto(origin, { waitUntil: 'networkidle0' });
  assert.equal(await theme(), 'light');
  checks.push('Keyboard toggle, saved preference, full-site entry, and return');

  // System changes apply when there is no manual preference.
  await page.evaluate(() => localStorage.removeItem('theme'));
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await theme(), 'dark');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  checks.push('System appearance changes update the welcome screen');

  for (const hash of ['#our-work', '#how-it-works', '#leadership']) {
    await page.goto(`${origin}/${hash}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => location.pathname === '/explore/');
    assert.equal(new URL(page.url()).hash, hash);
    assert.ok(await page.$(hash));
  }
  await page.goto(`${origin}/welcome/`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => location.pathname === '/');
  checks.push('Old homepage anchors and the welcome preview URL reach their intended content');

  // CSS still respects system appearance with JavaScript disabled.
  await page.setJavaScriptEnabled(false);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(origin, { waitUntil: 'networkidle0' });
  assert.equal(
    await page.$eval('body', (element) => getComputedStyle(element).backgroundColor),
    'rgb(16, 17, 20)',
  );
  assert.equal(await page.$eval('.enter', (element) => element.getAttribute('href')), '/explore/');
  checks.push('No-JavaScript system theme and entry link');
  assert.deepEqual(errors, []);
  await writeFile(`${output}/audit.json`, JSON.stringify({ checks, failures: 0 }, null, 2));
  console.log(`Welcome: ${checks.length} checks passed.`);
} finally {
  await browser.close();
}

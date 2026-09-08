import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import worker from '../worker.ts';

const origin = process.env.SITE_ORIGIN || 'http://127.0.0.1:4323';
const output = 'artifacts/redesign';
await mkdir(output, { recursive: true });
const checks = [];
const requests = [];
const deliveries = [];
let mode = 'success';
let release;
const realFetch = globalThis.fetch;
// Exercise the existing Worker but prevent any actual email delivery.
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.resend.com/emails');
  deliveries.push(JSON.parse(options.body));
  return new Response(
    mode === 'provider-error' ? 'Simulated delivery failure' : JSON.stringify({ id: 'test-only' }),
    {
      status: mode === 'provider-error' ? 503 : 200,
    },
  );
};
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    if (new URL(request.url()).pathname !== '/api/contact') return request.continue();
    requests.push({
      method: request.method(),
      headers: request.headers(),
      data: JSON.parse(request.postData()),
    });
    if (mode === 'network-error') return request.abort('failed');
    if (mode === 'pending')
      await new Promise((resolve) => {
        release = resolve;
      });
    const response = await worker.fetch(
      new Request(request.url(), {
        method: request.method(),
        headers: request.headers(),
        body: request.postData(),
      }),
      {
        RESEND_API_KEY: 'test-only',
        ASSETS: {
          fetch() {
            throw new Error('Unexpected asset request');
          },
        },
      },
    );
    await request.respond({
      status: response.status,
      contentType: 'application/json',
      body: await response.text(),
    });
  });
  const visible = (selector) => page.$eval(selector, (element) => !element.hidden);
  const fill = async () => {
    await page.type('[name="name"]', 'Contact Verification');
    await page.type('[name="email"]', 'verification@example.com');
    await page.type('[name="message"]', 'A local test that must never be delivered.');
  };
  const check = (name) => {
    checks.push(name);
    console.log(`Passed: ${name}`);
  };
  for (const route of ['/contact/']) {
    mode = 'success';
    await page.goto(`${origin}${route}`, { waitUntil: 'networkidle0' });
    const beforeEmpty = requests.length;
    await page.click('button[type="submit"]');
    assert.equal(await page.$eval('#contact-form', (form) => form.checkValidity()), false);
    assert.equal(requests.length, beforeEmpty);
    assert.equal(await visible('#form-success'), false);
    check(`${route} empty submission is rejected`);
    await fill();
    {
      await page.type('[name="company"]', 'Example Studio');
      await page.select('[name="service"]', 'Mobile app development');
    }
    mode = 'pending';
    const beforeSubmit = requests.length;
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('#submit-btn').disabled);
    assert.equal(await visible('.btn-loading'), true);
    // A second submission event cannot duplicate an in-flight delivery.
    await page.$eval('#contact-form', (form) =>
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    await page.waitForFunction(() => document.querySelector('.btn-label').hidden);
    while (!release) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(requests.length, beforeSubmit + 1);
    release();
    release = undefined;
    await page.waitForSelector('#form-success:not([hidden])');
    const submitted = requests.at(-1);
    assert.equal(submitted.method, 'POST');
    assert.equal(submitted.headers['content-type'], 'application/json');
    assert.equal(submitted.data._honeypot, '');
    const delivered = deliveries.at(-1);
    assert.deepEqual(delivered.to, ['hello@idlefusion.com']);
    assert.equal(delivered.reply_to, 'verification@example.com');
    assert.equal(delivered.subject, 'New contact from Contact Verification');
    assert.match(delivered.text, /A local test that must never be delivered\./);
    {
      assert.match(delivered.text, /Company: Example Studio/);
      assert.match(delivered.text, /Project: Mobile app development/);
    }
    assert.equal(await page.$eval('[name="message"]', (element) => element.value), '');
    assert.equal(await page.$eval('#submit-btn', (element) => element.disabled), false);
    check(`${route} sends once, keeps original recipient/reply-to, confirms and resets`);
    await fill();
    mode = 'provider-error';
    await page.click('button[type="submit"]');
    await page.waitForSelector('#form-error:not([hidden])');
    assert.match(
      await page.$eval('#form-error', (element) => element.textContent),
      /Failed to send/,
    );
    assert.equal(await visible('#form-success'), false);
    assert.notEqual(await page.$eval('[name="message"]', (element) => element.value), '');
    assert.equal(await page.$eval('#submit-btn', (element) => element.disabled), false);
    check(`${route} delivery failure preserves the message and allows retry`);
    mode = 'network-error';
    await page.click('button[type="submit"]');
    await page.waitForFunction(() =>
      document.querySelector('#form-error').textContent.includes('Network error'),
    );
    assert.equal(await page.$eval('#submit-btn', (element) => element.disabled), false);
    check(`${route} connection failure is explained and allows retry`);
    mode = 'success';
    await page.click('button[type="submit"]');
    await page.waitForSelector('#form-success:not([hidden])');
    assert.equal(await visible('#form-error'), false);
    check(`${route} retry succeeds and clears the previous error`);
    await fill();
    await page.$eval('[name="_honeypot"]', (element) => {
      element.value = 'spam';
    });
    const beforeSpam = deliveries.length;
    await page.click('button[type="submit"]');
    await page.waitForSelector('#form-success:not([hidden])');
    assert.equal(deliveries.length, beforeSpam);
    check(`${route} honeypot suppresses delivery`);
  }
  // Check server-side validation independently of browser constraints.
  for (const data of [
    { name: '', email: 'valid@example.com', message: 'Hi' },
    { name: 'Test', email: 'invalid', message: 'Hi' },
  ]) {
    const before = deliveries.length;
    const response = await worker.fetch(
      new Request(`${origin}/api/contact`, { method: 'POST', body: JSON.stringify(data) }),
      { RESEND_API_KEY: 'test-only' },
    );
    assert.equal(response.status, 400);
    assert.equal(deliveries.length, before);
  }
  check('Worker rejects missing fields and invalid email before delivery');
  for (const [device, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(`${origin}/contact/`, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: `${output}/contact-${device}.png`, fullPage: true });
    if (device === 'desktop') await page.screenshot({ path: `${output}/contact-preview.png` });
    check(`Contact ${device} layout fits and screenshot refreshed`);
  }
  assert.deepEqual(pageErrors, []);
  await writeFile(
    `${output}/contact-audit.json`,
    JSON.stringify({ checks, failures: 0, delivery: 'Simulated; no real emails sent' }, null, 2),
  );
  console.log(`${checks.length} checks passed. No real emails sent.`);
} finally {
  await browser.close();
  globalThis.fetch = realFetch;
}

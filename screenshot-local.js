const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:4700', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: '/Users/m4max/.clawdbot/media/idlefusion-preview.png', fullPage: true });
  await browser.close();
  console.log('Screenshot saved!');
})();

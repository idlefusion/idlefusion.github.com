// A screenshot of the whole page. Puppeteer's `fullPage` capture paints beyond
// the viewport and now and then draws a headline at the wrong size, so the
// viewport is made as tall as the page instead (the site has no vh units).
export async function fullScreenshot(page, path) {
  const viewport = page.viewport();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewport({ ...viewport, height });
  await page.screenshot({ path });
  await page.setViewport(viewport);
}

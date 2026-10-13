// Renders tools/og-card.html to assets/og-image.png with Playwright.
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto('file://' + path.join(__dirname, 'og-card.html'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(__dirname, '..', 'assets', 'og-image.png') });
  await browser.close();
})();

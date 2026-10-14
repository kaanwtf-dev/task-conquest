// Dev helper: screenshot a page with the preinstalled Chromium.
// usage: node scripts/shot.mjs <url> <out.png> [width] [height] [fullPage 1|0] [dpr]
import { chromium } from 'playwright-core';

const [, , url, out, w = '1200', h = '900', full = '1', dpr = '1'] = process.argv;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: full === '1' });
if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
await browser.close();

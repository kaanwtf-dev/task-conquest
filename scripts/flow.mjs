// Dev helper: drive the app through onboarding + main screens and capture screenshots.
// usage: node scripts/flow.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'shots';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const errs = [];

async function run(name, viewport, dpr, steps) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: viewport.width < 900 });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errs.push(`[${name}] ${m.text()}`));
  page.on('pageerror', (e) => errs.push(`[${name}] ${e}`));
  await page.goto(base, { waitUntil: 'networkidle' });
  await steps(page, (file, opts = {}) => page.screenshot({ path: `${out}/${name}-${file}.png`, ...opts }));
  await ctx.close();
}

const create = async (page, race = 'Elf', cls = 'Mage') => {
  await page.getByRole('button', { name: race, exact: true }).click();
  await page.getByRole('button', { name: cls, exact: true }).click();
  await page.getByLabel('Hero name').fill('Aldric');
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.waitForTimeout(400);
};

await run('phone', { width: 390, height: 844 }, 2, async (page, shot) => {
  await page.waitForTimeout(500);
  await shot('1-create');
  await shot('1b-create-full', { fullPage: true });
  await create(page, 'Human', 'Knight');
  await page.waitForTimeout(600);
  await shot('2-daily');
  // complete a task and capture mid-battle
  await page.getByRole('button', { name: 'Complete' }).nth(1).click();
  await page.waitForTimeout(380);
  await shot('3-battle');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Complete' }).first().click();
  await page.waitForTimeout(1600);
  await shot('4-after');
  await page.getByRole('button', { name: /Groceries/ }).click();
  await page.waitForTimeout(500);
  await shot('5-groceries');
  await page.getByRole('button', { name: /Side Quests/ }).click();
  await page.waitForTimeout(400);
  await shot('6-side');
  await page.locator('.tab', { hasText: 'Hero' }).click();
  await page.waitForTimeout(400);
  await shot('7-hero');
});

await run('desktop', { width: 1440, height: 900 }, 1, async (page, shot) => {
  await create(page, 'Orc', 'Berserker');
  await page.getByRole('button', { name: /Weekly Quests/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Complete' }).first().click();
  await page.waitForTimeout(1600);
  await page.getByRole('button', { name: 'Complete' }).first().click();
  await page.waitForTimeout(400);
  await shot('1-weekly-battle');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /Groceries/ }).click();
  await page.waitForTimeout(500);
  await shot('2-groceries');
});

await run('create-desktop', { width: 1440, height: 900 }, 1, async (page, shot) => {
  await page.getByRole('button', { name: 'Catfolk', exact: true }).click();
  await page.getByRole('button', { name: 'Ranger', exact: true }).click();
  await page.waitForTimeout(300);
  await shot('1');
});

if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
await browser.close();

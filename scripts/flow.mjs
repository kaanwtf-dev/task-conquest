// Dev helper: drive the app through onboarding + every main screen and capture screenshots.
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
  page.on('dialog', (d) => d.accept());
  await page.goto(base, { waitUntil: 'networkidle' });
  try {
    await steps(page, (file, opts = {}) => page.screenshot({ path: `${out}/${name}-${file}.png`, ...opts }));
  } catch (e) {
    errs.push(`[${name}] STEP FAILED: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: `${out}/${name}-FAILED.png` });
  }
  await ctx.close();
}

const create = async (page, race = 'Elf', cls = 'Mage') => {
  await page.getByRole('button', { name: race, exact: true }).click();
  await page.getByRole('button', { name: cls, exact: true }).click();
  await page.getByLabel('Hero name').fill('Aldric');
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.waitForTimeout(400);
};

/** Give the hero some progress + loot so screens have content. */
const grind = async (page, n) => {
  await page.evaluate((count) => {
    const { store } = window.__ql;
    const s = store.getState();
    const side = Object.values(s.lists).find((l) => l.type === 'quests');
    for (let i = 0; i < count; i++) {
      const id = store.getState().addTask(side.id, `Grind ${i}`, { difficulty: 4 });
      store.getState().toggleTask(id);
    }
    const st = store.getState();
    store.setState({ hero: { ...st.hero, gold: { ...st.hero.gold, bonus: 5000 } } });
  }, n);
  await page.waitForTimeout(300);
};

const tab = (page, label) => page.locator('.tab', { hasText: label }).click();

await run('phone', { width: 390, height: 844 }, 2, async (page, shot) => {
  await page.waitForTimeout(400);
  await shot('01-create');
  await create(page, 'Human', 'Knight');
  await page.waitForTimeout(500);
  await shot('02-daily');
  await page.getByRole('button', { name: /^Complete / }).nth(1).click();
  await page.waitForTimeout(380);
  await shot('03-battle');
  await page.waitForTimeout(1600);
  // task editor
  await page.locator('.task .ttitle', { hasText: 'Workout' }).click();
  await page.waitForTimeout(300);
  await shot('04-edit-task');
  await page.getByRole('button', { name: 'Cancel' }).click();
  // today view
  await page.getByRole('button', { name: /Today/ }).first().click();
  await page.waitForTimeout(300);
  await shot('05-today');
  // groceries
  await page.getByRole('button', { name: /Groceries/ }).click();
  await page.waitForTimeout(300);
  await shot('06-groceries');
  // progress + loot
  await grind(page, 40);
  await page.waitForTimeout(3500);
  await page.locator('.boss-bar').click();
  await page.waitForTimeout(300);
  await shot('07-boss');
  await page.getByRole('button', { name: 'To battle!' }).click();
  await tab(page, 'Hero');
  await page.waitForTimeout(300);
  await shot('08-hero-gear');
  await page.getByRole('button', { name: 'Bag', exact: true }).click();
  await page.waitForTimeout(300);
  await shot('09-bag');
  const cell = page.locator('.bag-grid .item-cell').first();
  if (await cell.count()) {
    await cell.click();
    await page.waitForTimeout(300);
    await shot('10-item');
    await page.mouse.click(5, 5);
  }
  await page.getByRole('button', { name: /Feats/ }).click();
  await page.waitForTimeout(300);
  await shot('11-feats');
  await tab(page, 'Shop');
  await page.waitForTimeout(400);
  await shot('12-shop');
  await tab(page, 'Party');
  await page.waitForTimeout(300);
  await shot('13-party');
  await tab(page, 'Options');
  await page.waitForTimeout(300);
  await shot('14-settings');
});

await run('desktop', { width: 1440, height: 900 }, 1, async (page, shot) => {
  await create(page, 'Orc', 'Berserker');
  await grind(page, 25);
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: /Weekly Quests/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Complete / }).first().click();
  await page.waitForTimeout(420);
  await shot('1-weekly-battle');
  await page.waitForTimeout(1600);
  await page.locator('.side-item', { hasText: 'Hero' }).click();
  await page.waitForTimeout(300);
  await shot('2-hero');
  await page.locator('.side-item', { hasText: 'Shop' }).click();
  await page.waitForTimeout(300);
  await shot('3-shop');
});

if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
await browser.close();

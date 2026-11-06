import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3001';
const OUT = 'docs/screens';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

await page.screenshot({ path: `${OUT}/01-board.png` });

// Salary tab with rows
await page.getByRole('button', { name: /\$150K\+/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/02-tab-150k.png` });

// Drawer
const firstRow = page.locator('table.jobs tbody tr').first();
if (await firstRow.count()) {
  await firstRow.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/03-job-drawer.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// Queue
await page.getByRole('button', { name: /Needs verification/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/04-verification-queue.png` });

// Employers
await page.getByRole('button', { name: /Employer database/ }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/05-employers.png` });

// History
await page.getByRole('button', { name: /Refresh history/ }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/06-history.png` });

// How to use
await page.getByRole('button', { name: /How to use/i }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/07-how-to.png` });
await page.keyboard.press('Escape');

// Mobile view
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.waitForTimeout(500);
await mobile.screenshot({ path: `${OUT}/08-mobile.png` });

await browser.close();
console.log('screenshots written to', OUT);

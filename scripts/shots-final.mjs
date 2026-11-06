import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3003';
const OUT = 'docs/screens';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

await page.getByRole('button', { name: /\$150K\+/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/01-board-150k.png` });

await page.locator('table.jobs tbody tr').first().click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/02-job-drawer.png` });
await page.keyboard.press('Escape');

await page.getByRole('button', { name: /Archived/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/03-archive.png` });

await page.getByRole('button', { name: /Needs verification/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/04-queue.png` });

await page.getByRole('button', { name: /Employer database/ }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/05-employers.png` });

await page.getByRole('button', { name: /Refresh history/ }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/06-history.png` });

await page.getByRole('button', { name: /How to use/i }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/07-how-to.png` });
await page.keyboard.press('Escape');

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.waitForTimeout(500);
await mobile.screenshot({ path: `${OUT}/08-mobile.png`, fullPage: false });

await browser.close();
console.log('final screenshots written');

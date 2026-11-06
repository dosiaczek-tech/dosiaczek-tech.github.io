import { test, expect } from '@playwright/test';

for (const trigger of ['online', 'app:resume']) {
  test(`catalogue recovers after ${trigger} without reloading or clearing the journal`, async ({ page }) => {
    let unavailable = true;
    await page.route('**/data/routes.json', route => unavailable ? route.abort() : route.continue());
    await page.goto('./');
    await expect(page.locator('#catalog-error')).toBeVisible();
    await page.evaluate(() => localStorage.setItem('sup:availability-test', 'preserved'));
    unavailable = false;
    await page.evaluate(name => window.dispatchEvent(new Event(name)), trigger);
    await expect(page.locator('#catalog-error')).toBeHidden();
    expect(await page.locator('.route-card').count()).toBeGreaterThan(0);
    expect(await page.evaluate(() => localStorage.getItem('sup:availability-test'))).toBe('preserved');
  });
}

import { test, expect } from '@playwright/test';

test.describe('Partner attribution', () => {
  test('?p= query param sets cookie', async ({ page, context }) => {
    await page.goto('/?p=test-hotel-bari');
    const cookies = await context.cookies();
    const cookie = cookies.find((c) => c.name === 'lg_partner');
    expect(cookie?.value).toBe('test-hotel-bari');
  });

  test('cookie persists across page navigation', async ({ page, context }) => {
    await page.goto('/?p=test-hotel-bari');
    await page.goto('/guide/bari-vecchia');
    const cookies = await context.cookies();
    const cookie = cookies.find((c) => c.name === 'lg_partner');
    expect(cookie?.value).toBe('test-hotel-bari');
  });

  test('invalid slug pattern is rejected (no cookie set)', async ({ page, context }) => {
    await page.goto('/?p=<script>alert(1)</script>');
    const cookies = await context.cookies();
    const cookie = cookies.find((c) => c.name === 'lg_partner');
    expect(cookie).toBeUndefined();
  });

  test('localStorage backup is set', async ({ page }) => {
    await page.goto('/?p=test-hotel-bari');
    const ls = await page.evaluate(() => localStorage.getItem('lg_partner'));
    expect(ls).toBe('test-hotel-bari');
  });

  test('partner pitch page renders form', async ({ page }) => {
    await page.goto('/diventa-partner');
    await expect(
      page.getByRole('heading', { name: /Aiuta i tuoi ospiti a capire la Puglia/i }),
    ).toBeVisible();
    await expect(page.locator('#partner-form')).toBeVisible();
  });
});

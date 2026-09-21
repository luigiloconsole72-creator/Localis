import { test, expect } from '@playwright/test';

// Aspettative riallineate il 2026-09-21. La suite non partiva (webServer usava
// `astro preview`, che l'adapter Vercel non supporta), quindi era rimasta ferma
// al copy di prima del riposizionamento di giugno: cercava ancora "Ascolta
// Bari" e una sezione prezzi con le PriceCard sulla home.

test.describe('Italian homepage', () => {
  test('header renders logo and language switcher', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Localis', exact: true }).first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');

    // Il selettore di lingua e' una bandiera con aria-label, non piu' un link
    // testuale "EN": il nome accessibile e' l'unica presa stabile.
    const langSwitch = page.getByRole('link', { name: 'English' }).first();
    await expect(langSwitch).toBeVisible();
    await expect(langSwitch).toHaveAttribute('href', /\/en\//);
  });

  test('renders hero with correct copy', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /La Puglia, raccontata da chi ci vive/,
    );
    await expect(
      page.getByText(/Racconti audio documentati per capire Bari e la Puglia mentre le visiti/),
    ).toBeVisible();
  });

  test('renders the four destination zones', async ({ page }) => {
    await page.goto('/');
    for (const zone of ['/bari', '/valle-d-itria', '/gargano', '/matera']) {
      await expect(page.locator(`main a[href="${zone}"]`).first()).toBeVisible();
    }
  });

  test('pricing section lists the three tiers', async ({ page }) => {
    await page.goto('/#prezzi');
    const pricing = page.locator('#prezzi');
    await expect(pricing).toContainText('Guida singola');
    await expect(pricing).toContainText('€4,99');
    await expect(pricing).toContainText('Pack 3');
    await expect(pricing).toContainText('€11,99');
    await expect(pricing).toContainText('Pack 6');
    await expect(pricing).toContainText('€19,99');
  });

  test('buy button posts the selection to /api/checkout', async ({ page }) => {
    // I bottoni d'acquisto vivono sulla pagina guida, non piu' sulla home.
    await page.goto('/guide/bari-vecchia');

    // Il checkout non e' una fetch: e' un form POST che naviga verso Stripe.
    // Qui lo si intercetta e si risponde con un redirect innocuo.
    let payload: string | null = null;
    await page.route('**/api/checkout*', async (route) => {
      payload = route.request().postData();
      await route.fulfill({ status: 303, headers: { location: '/' }, body: '' });
    });

    await page.getByRole('button', { name: /Acquista guida singola/i }).first().click();

    await expect.poll(() => payload).not.toBeNull();
    expect(payload).toContain('product=single');
    expect(payload).toContain('guideSlug=bari-vecchia');
    expect(payload).toContain('lang=it');
  });

  test('language switcher navigates to English', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'English' }).first().click();
    await expect(page).toHaveURL(/\/en\//);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /in the words of the people who live here/,
    );
  });

  test('skip-to-content link appears on Tab focus', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: /skip to main content|salta al contenuto/i });
    await expect(skipLink).toBeFocused();
  });

  test('footer renders copyright and links', async ({ page }) => {
    await page.goto('/');
    const footer = page.getByRole('contentinfo');
    await expect(footer).toBeVisible();
    await expect(footer.getByText(/© Localis/)).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Termini' })).toBeVisible();
  });
});

test.describe('English homepage', () => {
  test('renders English hero copy', async ({ page }) => {
    await page.goto('/en/');
    await expect(
      page.getByText(/Documented audio stories to understand Bari and Puglia as you visit/),
    ).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

test.describe('Checkout flow', () => {
  // Requires real STRIPE_SECRET_KEY + populated stripe-prices.json. Skip until env is wired.
  test.fixme('clicking buy redirects to Stripe Checkout (host)', async ({ page }) => {
    await page.goto('/guide/bari-vecchia');
    const buyButton = page.getByRole('button', { name: /Acquista guida singola/i }).first();
    await buyButton.click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 });
    expect(page.url()).toContain('checkout.stripe.com');
  });

  test('thanks page handles missing session_id with recovery copy', async ({ page }) => {
    await page.goto('/thanks');
    await expect(page.getByRole('heading', { name: /stiamo preparando il tuo accesso/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /recupera accesso|recover access/i })).toBeVisible();
  });

  test('access page with invalid token redirects to access-invalid', async ({ page }) => {
    await page.goto('/access/clearly-not-a-jwt');
    await expect(page).toHaveURL(/access-invalid/);
  });


  // Regressione 2026-09-21: /thanks e' l'unica pagina d'acquisto in SSR, quindi
  // il redirect lingua del middleware la spediva su /de/thanks — rotta che non
  // esiste. Ogni compratore tedesco o inglese vedeva un 404 appena pagato.
  for (const lang of ['de', 'en']) {
    test(`thanks page stays reachable with lg_lang=${lang}`, async ({ page, context }) => {
      await context.addCookies([
        { name: 'lg_lang', value: lang, url: 'http://localhost:4321' },
      ]);
      const response = await page.goto('/thanks?session_id=cs_test_not_a_real_session');
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe('/thanks');
    });
  }

  // Prima chi annullava su Stripe tornava su una pagina identica a quella di
  // partenza, senza una parola: `cancelled` non lo leggeva nessuno.
  test('cancelling checkout shows a notice in the page language', async ({ page }) => {
    await page.goto('/de/guide/bari-vecchia?cancelled=1');
    const notice = page.locator('#checkout-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/Zahlung abgebrochen/i);
    // Il parametro sparisce dall'URL: un refresh non deve far ricomparire
    // un avviso che non e' piu' pertinente.
    await expect.poll(() => new URL(page.url()).search).toBe('');
  });

  test('checkout error is explained instead of bouncing back silently', async ({ page }) => {
    await page.goto('/en/guide/bari-vecchia?checkoutError=1');
    await expect(page.locator('#checkout-notice')).toContainText(/could not open the payment page/i);
  });

  test('recover form submits and shows success', async ({ page }) => {
    await page.goto('/recover');
    await page.fill('input[name="email"]', 'test-noreal@example.com');
    await page.click('button[type="submit"]');
    await expect(page.getByText(/Email inviata/)).toBeVisible({ timeout: 10_000 });
  });
});

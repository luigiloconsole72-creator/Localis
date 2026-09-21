import { test, expect } from '@playwright/test';

// Aspettative riallineate il 2026-09-21 (vedi nota in homepage.spec.ts).
// Nei titoli si usano regex: il copy contiene apostrofi tipografici e trattini
// lunghi, e una stringa esatta si rompe al primo ritocco di punteggiatura.

test.describe('Guide detail page', () => {
  test('Bari Vecchia detail renders title, sample, chapters, sidebar', async ({ page }) => {
    await page.goto('/guide/bari-vecchia');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bari Vecchia');

    // L'assaggio audio non ha un tag <audio> nel markup: il player costruisce
    // `new Audio(src)` al primo play, quindi si verifica il contenitore.
    const sample = page.locator('.hero-sample');
    await expect(sample).toBeVisible();
    await expect(sample).toHaveAttribute('data-src', /\.mp3$/);
    await expect(sample.getByRole('button', { name: /play/i })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Capitoli' })).toBeVisible();
    // La scheda prezzo e' doppia: inline su mobile, sticky su desktop.
    await expect(page.getByRole('heading', { name: 'Guida singola' }).first()).toBeVisible();
  });

  test('Bari Vecchia renders the SEO editorial block', async ({ page }) => {
    await page.goto('/guide/bari-vecchia');
    await expect(
      page.getByRole('heading', { name: /Bari Vecchia: l.itinerario audio per capire la citt/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Vedere Bari Vecchia . facile\. Capirla/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /costruito attraverso ricerca e fonti/i }),
    ).toBeVisible();
  });

  test('English version renders correctly', async ({ page }) => {
    await page.goto('/en/guide/bari-vecchia');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Old Bari');
    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Understand Old Bari: the audio route through the city/i }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Single guide' }).first()).toBeVisible();
  });

  test('German version renders the localized SEO editorial block', async ({ page }) => {
    await page.goto('/de/guide/bari-vecchia');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bari Vecchia');
    await expect(page.getByRole('heading', { name: 'Kapitel' })).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: /Bari Vecchia verstehen: die Audio-Route durch die Altstadt/i,
      }),
    ).toBeVisible();
  });

  // BRAND.md: "audioguida" solo in <title>/meta, mai nel copy visibile.
  // Fino al 2026-09-22 l'italiano rispettava la regola e inglese e tedesco no:
  // 33 e 34 occorrenze visibili su 18 pagine guida, meta' dentro un heading.
  for (const [path, term] of [
    ['/guide/bari-vecchia', /audioguid/i],
    ['/en/guide/bari-vecchia', /audio guide/i],
    ['/de/guide/bari-vecchia', /audioguide/i],
  ] as const) {
    test(`${path} keeps the category word out of the visible copy`, async ({ page }) => {
      await page.goto(path);
      const visible = await page.locator('main').innerText();
      expect(visible).not.toMatch(term);
    });
  }

  // Il test "soon-status guide is not directly accessible" e' stato rimosso:
  // usava tre-teatri, che dal 2026 e' `status: live` come tutte e 19 le guide.
  // Non esiste piu' una guida `soon` su cui appoggiarlo, e il 404 delle rotte
  // sconosciute e' gia' coperto qui sotto.
});

test.describe('Legal and error pages', () => {
  test('404 page renders for unknown route', async ({ page }) => {
    const response = await page.goto('/this-does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByText('404')).toBeVisible();
  });

  test('terms page renders', async ({ page }) => {
    await page.goto('/termini');
    await expect(page.getByRole('heading', { name: 'Termini di servizio' })).toBeVisible();
  });

  test('terms state the voluntary refund guarantee', async ({ page }) => {
    await page.goto('/termini');
    await expect(page.getByText(/garanzia\s+commerciale volontaria/i)).toBeVisible();
  });

  test('privacy page renders', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Informativa privacy' })).toBeVisible();
  });

  test('about page renders both languages', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { name: /una redazione, non un generatore/i })).toBeVisible();
    await page.goto('/en/about');
    await expect(
      page.getByRole('heading', { name: /an editorial team, not a content generator/i }),
    ).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

// Le pagine zona sono la superficie che intercetta il traffico di ricerca.
// Fino al 2026-09-22 il blocco prezzi stava in fondo, dopo le biografie degli
// autori: su /bari serviva scorrere 9,9 schermate su 13 per vedere un prezzo.
// Inglese e tedesco di /bari erano gia' stati sistemati e l'italiano no — la
// deriva era passata inosservata proprio perche' nessun test la guardava.
const ZONE_PAGES = [
  '/bari', '/en/bari', '/de/bari',
  '/valle-d-itria', '/en/valle-d-itria', '/de/valle-d-itria',
  '/gargano', '/en/gargano', '/de/gargano',
];

test.describe('Zone pages keep the price within reach', () => {
  for (const path of ZONE_PAGES) {
    test(`${path} shows pricing in the first half of the page`, async ({ page }) => {
      await page.goto(path);

      const position = await page.evaluate(() => {
        const section = document.querySelector('#prezzi, #preise, #pricing');
        if (!section) return null;
        const top = section.getBoundingClientRect().top + window.scrollY;
        return top / document.body.scrollHeight;
      });

      expect(position, 'la sezione prezzi deve esistere').not.toBeNull();
      expect(position!).toBeLessThan(0.55);
    });

    test(`${path} offers a jump to pricing above the fold`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);

      const jump = page.locator('main a[href^="#"]').first();
      await expect(jump).toBeVisible();

      const top = await jump.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      expect(top, 'il link deve stare nella prima schermata').toBeLessThan(844);

      // Punta a un'ancora che esiste davvero: gli id sono localizzati
      // (#prezzi, #preise, #pricing) ed e' facile sbagliarli per lingua.
      const href = await jump.getAttribute('href');
      await expect(page.locator(href!)).toHaveCount(1);
    });
  }
});

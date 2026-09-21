import { describe, expect, it } from 'vitest';
import { customPriceCents, priceForProduct, FREE_CHOICE_TIERS } from '../../src/lib/pricing';

// Il builder mostra 19 card: le 18 pugliesi piu' Matera.
const MAX_SELECTION = 19;

describe('customPriceCents', () => {
  // Il difetto che questa funzione esiste per impedire (audit 2026-09-21):
  // la selezione libera era una semplice moltiplicazione, quindi 5 guide
  // costavano 24,95 contro i 19,99 di 6, e 17 ne costavano 84,83 contro i
  // 39,99 di tutte e 18. Chi ne sceglieva di piu' pagava di piu'.
  it('never charges more for a bigger selection', () => {
    for (let n = 2; n <= MAX_SELECTION; n++) {
      expect(customPriceCents(n)).toBeGreaterThanOrEqual(customPriceCents(n - 1));
    }
  });

  it('never charges more than a pack that already covers the selection', () => {
    for (let n = 1; n <= MAX_SELECTION; n++) {
      for (const tier of FREE_CHOICE_TIERS) {
        if (tier.count >= n) {
          expect(customPriceCents(n)).toBeLessThanOrEqual(tier.priceCents);
        }
      }
    }
  });

  it('prices the known steps', () => {
    expect(customPriceCents(1)).toBe(499);
    expect(customPriceCents(2)).toBe(998);
    expect(customPriceCents(4)).toBe(1996);
    expect(customPriceCents(5)).toBe(1999); // cap sul Pack 6
    expect(customPriceCents(9)).toBe(3999); // cap sulle 18
    expect(customPriceCents(17)).toBe(3999);
    expect(customPriceCents(19)).toBe(4498); // le 18 + Matera singola
  });

  it('treats an empty selection as free', () => {
    expect(customPriceCents(0)).toBe(0);
  });
});

describe('priceForProduct', () => {
  it('uses the fixed price for packs and the cap for free selections', () => {
    expect(priceForProduct('sestina', 6)).toBe(1999);
    expect(priceForProduct('puglia-completa', 18)).toBe(3999);
    expect(priceForProduct('crociera', 2)).toBe(799);
    expect(priceForProduct('custom', 17)).toBe(3999);
  });
});

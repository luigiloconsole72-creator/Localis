/**
 * Listino e aritmetica dei prezzi. Vive separato da `stripe-prices.ts` perche'
 * quello legge `process.env` e il JSON dei price ID: roba che non puo' finire
 * nel bundle del browser. Qui dentro non entra nulla del genere, cosi' il
 * builder lato client e il server calcolano lo stesso prezzo con lo stesso
 * codice invece di due copie che prima o poi divergono.
 */

export type ProductSlug =
  | 'single'
  | 'custom'
  | 'tris'
  | 'sestina'
  | 'puglia-completa'
  | 'bari-completa'
  | 'valle-completa'
  | 'gargano-completa'
  | 'crociera';

export const PRODUCT_PRICE_CENTS: Record<ProductSlug, number> = {
  single:              499,
  custom:              499,
  tris:               1199,
  sestina:            1999,
  'puglia-completa':  3999,
  'bari-completa':    1999,
  'valle-completa':   1999,
  'gargano-completa': 1999,
  crociera:            799,
};

export type Tier = { product: ProductSlug; count: number; priceCents: number };

export const FREE_CHOICE_TIERS: readonly Tier[] = [
  { product: 'tris',            count: 3,  priceCents: 1199 },
  { product: 'sestina',         count: 6,  priceCents: 1999 },
  { product: 'puglia-completa', count: 18, priceCents: 3999 },
] as const;

const LARGEST_TIER = FREE_CHOICE_TIERS[FREE_CHOICE_TIERS.length - 1];

/**
 * Prezzo di una selezione libera (`custom`), cioe' fuori dai tagli 3/6/18.
 *
 * Regola: **non si paga mai piu' del modo piu' economico di ottenere almeno
 * quelle guide.** Prima era una semplice moltiplicazione e la scala non era
 * monotona: 5 guide costavano 24,95 contro i 19,99 di 6, e 17 ne costavano
 * 84,83 contro i 39,99 di tutte e 18. Chi sceglieva di piu' pagava di piu'.
 *
 *   1 → 4,99   ·   4 → 19,96   ·   5 → 19,99 (Pack 6)
 *   9 → 39,99 (le 18)   ·   19 → 44,98 (le 18 + una singola)
 */
export function customPriceCents(count: number): number {
  if (count <= 0) return 0;

  const straight = PRODUCT_PRICE_CENTS.single * count;

  // Il pacchetto piu' piccolo che copre gia' tutta la selezione.
  const fullCover = FREE_CHOICE_TIERS.find((tier) => tier.count >= count)?.priceCents;

  // Oltre il pacchetto piu' grande: quello, piu' le guide che avanzano.
  const overflow = count > LARGEST_TIER.count
    ? LARGEST_TIER.priceCents + (count - LARGEST_TIER.count) * PRODUCT_PRICE_CENTS.single
    : undefined;

  return Math.min(straight, fullCover ?? straight, overflow ?? straight);
}

/** Prezzo effettivamente addebitato per un prodotto, data la selezione. */
export function priceForProduct(product: ProductSlug, guideCount: number): number {
  return product === 'custom' ? customPriceCents(guideCount) : PRODUCT_PRICE_CENTS[product];
}

import prices from '../data/stripe-prices.json';

// Listino e aritmetica stanno in ./pricing (niente process.env, niente JSON
// dei price ID) cosi' anche il builder lato client puo' importarli. Qui si
// ri-esportano: nessun import esistente cambia.
export type { ProductSlug, Tier } from './pricing';
export {
  PRODUCT_PRICE_CENTS,
  FREE_CHOICE_TIERS,
  customPriceCents,
  priceForProduct,
} from './pricing';

import {
  FREE_CHOICE_TIERS as TIERS,
  type ProductSlug,
  type Tier,
} from './pricing';

const priceMap = prices as Record<string, string>;

// Only single and crociera use stored Stripe price IDs.
// Dynamic bundles (tris/sestina/puglia-completa/bari-completa) use price_data.
export const STRIPE_PRICE_IDS: Record<'single' | 'crociera', string> = {
  single:   process.env.Stripe_id_singola  || priceMap.single  || '',
  crociera: process.env.Stripe_id_pacchettocrociera || priceMap.crociera || '',
};

// ── Guide catalog ─────────────────────────────────────────────────────────────

export const BARI_GUIDES: readonly string[] = [
  'bari-vecchia',
  'san-nicola',
  'tre-teatri',
  'bari-tavola',
  'porto-bari',
  'bari-sotterranea',
] as const;

export const VALLE_GUIDES: readonly string[] = [
  'alberobello',
  'locorotondo',
  'martina-franca',
  'cisternino',
  'fasano',
  'ostuni',
] as const;

export const GARGANO_GUIDES: readonly string[] = [
  'gargano-vieste',
  'gargano-tremiti',
  'gargano-nord',
  'gargano-paesi',
  'gargano-sacro',
  'gargano-saline',
] as const;

export const MATERA_GUIDES: readonly string[] = [
  'matera',
] as const;

export const ALL_GUIDES: readonly string[] = [
  ...BARI_GUIDES,
  ...VALLE_GUIDES,
  ...GARGANO_GUIDES,
] as const;

export const PURCHASEABLE_GUIDES: readonly string[] = [
  ...ALL_GUIDES,
  ...MATERA_GUIDES,
] as const;

export const CROCIERA_GUIDES: readonly string[] = [
  'bari-vecchia',
  'bari-tavola',
] as const;

export type GuideZone = 'bari' | 'valle' | 'gargano';
export type PricingLanguage = 'it' | 'en' | 'de';

/**
 * Given a selection count, return the matching free-choice tier or null.
 */
export function getTierForCount(count: number): Tier | null {
  return TIERS.find((t) => t.count === count) ?? null;
}

export function getCheckoutProductForSelection(selectedSlugs: string[]): ProductSlug {
  if (selectedSlugs.length <= 1) return 'single';
  return getTierForCount(selectedSlugs.length)?.product ?? 'custom';
}

/**
 * Next tier above the current selection count (for upsell messaging).
 */
export function getNextTier(count: number): Tier | null {
  return TIERS.find((t) => t.count > count) ?? null;
}

export function getZoneForSlug(slug: string): GuideZone | null {
  if (BARI_GUIDES.includes(slug)) return 'bari';
  if (VALLE_GUIDES.includes(slug)) return 'valle';
  if (GARGANO_GUIDES.includes(slug)) return 'gargano';
  return null;
}

export function getSelectionZoneState(selectedSlugs: string[]): {
  count: number;
  zone: GuideZone | null;
  isSameZoneComplete: boolean;
} {
  const zones = new Set<GuideZone>();

  for (const slug of selectedSlugs) {
    const zone = getZoneForSlug(slug);
    if (zone) zones.add(zone);
  }

  const zone = zones.size === 1 ? [...zones][0] : null;

  return {
    count: selectedSlugs.length,
    zone,
    isSameZoneComplete: selectedSlugs.length === 6 && zone !== null,
  };
}

export function getPublicBundleLabel(
  product: ProductSlug,
  lang: PricingLanguage,
): string {
  switch (product) {
    case 'tris':
      return lang === 'en' ? 'Pack 3 Guides' : lang === 'de' ? '3er-Paket' : 'Pack 3 Guide';
    case 'custom':
      return lang === 'en'
        ? 'Custom selection'
        : lang === 'de'
          ? 'Individuelle Auswahl'
          : 'Selezione personalizzata';
    case 'sestina':
      return lang === 'en' ? 'Pack 6 Guides' : lang === 'de' ? '6er-Paket' : 'Pack 6 Guide';
    case 'bari-completa':
    case 'valle-completa':
    case 'gargano-completa':
      return lang === 'en'
        ? 'Pack 6 Guides (Complete Area)'
        : lang === 'de'
          ? '6er-Paket (Komplette Zone)'
          : 'Pack 6 Guide (Intera Zona)';
    case 'single':
      return lang === 'en'
        ? 'Single guide'
        : lang === 'de'
          ? 'Einzelner Guide'
          : 'Guida singola';
    case 'puglia-completa':
      return lang === 'en'
        ? 'All of Puglia'
        : lang === 'de'
          ? 'Ganz Apulien'
          : 'Tutta la Puglia';
    case 'crociera':
      return lang === 'en' ? 'Cruise pack' : lang === 'de' ? 'Kreuzfahrt-Paket' : 'Pacchetto crociera';
    default:
      return product;
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateSelectedSlugs(
  product: ProductSlug,
  selectedSlugs: string[],
): void {
  const validSet = new Set(PURCHASEABLE_GUIDES);
  for (const s of selectedSlugs) {
    if (!validSet.has(s)) {
      throw new Error(`Unknown guide slug: "${s}"`);
    }
  }
  if (product === 'tris' && selectedSlugs.length !== 3) {
    throw new Error(`tris requires exactly 3 guides, got ${selectedSlugs.length}`);
  }
  if (product === 'sestina' && selectedSlugs.length !== 6) {
    throw new Error(`sestina requires exactly 6 guides, got ${selectedSlugs.length}`);
  }
  if (product === 'puglia-completa' && selectedSlugs.length !== 18) {
    throw new Error(`puglia-completa requires all 18 guides`);
  }
  if (product === 'bari-completa') {
    const bariSet = new Set(BARI_GUIDES);
    if (selectedSlugs.length !== 6 || !selectedSlugs.every((s) => bariSet.has(s))) {
      throw new Error(`bari-completa requires exactly the 6 Bari guides`);
    }
  }
  if (product === 'valle-completa') {
    const valleSet = new Set(VALLE_GUIDES);
    if (selectedSlugs.length !== 6 || !selectedSlugs.every((s) => valleSet.has(s))) {
      throw new Error(`valle-completa requires exactly the 6 Valle d'Itria guides`);
    }
  }
  if (product === 'gargano-completa') {
    const garganoSet = new Set(GARGANO_GUIDES);
    if (selectedSlugs.length !== 6 || !selectedSlugs.every((s) => garganoSet.has(s))) {
      throw new Error(`gargano-completa requires exactly the 6 Gargano guides`);
    }
  }
  if (product === 'single' && selectedSlugs.length !== 1) {
    throw new Error(`single requires exactly 1 guide slug`);
  }
  if (product === 'custom' && selectedSlugs.length < 2) {
    throw new Error(`custom requires at least 2 guide slugs`);
  }
  if (product === 'crociera' && selectedSlugs.length !== 2) {
    throw new Error(`crociera requires exactly 2 guide slugs`);
  }
}

export function getStripePrice(slug: 'single' | 'crociera'): string {
  const id = STRIPE_PRICE_IDS[slug];
  if (!id || id.startsWith('price_REPLACE')) {
    throw new Error(`Stripe price ID not configured for product "${slug}"`);
  }
  return id;
}

/** Cents → euro string for display (e.g. 1199 → "€11,99") */
export function formatPriceCents(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace('.', ',')}`;
}

/** Savings in cents vs buying singles */
export function savingsCents(product: ProductSlug): number {
  const tiers: Partial<Record<ProductSlug, number>> = {
    tris:              3 * 499 - 1199,   // 298
    sestina:           6 * 499 - 1999,   // 995
    'puglia-completa': 18 * 499 - 3999,  // 4983
    'bari-completa':    6 * 499 - 1999,   // 995
    'valle-completa':   6 * 499 - 1999,   // 995
    'gargano-completa': 6 * 499 - 1999,   // 995
  };
  return tiers[product] ?? 0;
}

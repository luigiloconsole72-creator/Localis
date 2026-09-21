import type { APIRoute } from 'astro';
import { getStripe } from '../../lib/stripe';
import {
  getStripePrice,
  validateSelectedSlugs,
  priceForProduct,
  ALL_GUIDES,
  BARI_GUIDES,
  VALLE_GUIDES,
  GARGANO_GUIDES,
  CROCIERA_GUIDES,
  type ProductSlug,
} from '../../lib/stripe-prices';
import { getActivePartner } from '../../lib/partners';
import { sendGa4BeginCheckout } from '../../lib/ga4-mp';
import type { Lang } from '../../lib/i18n';
import { hasAllowedOrigin } from '../../lib/request-security';
import type Stripe from 'stripe';

const VALID_PRODUCTS = new Set<ProductSlug>([
  'single', 'custom', 'tris', 'sestina', 'puglia-completa',
  'bari-completa', 'valle-completa', 'gargano-completa', 'crociera',
]);

// Nome mostrato sulla pagina di pagamento Stripe. Rispecchia la terminologia
// che l'utente ha appena letto sul sito nella sua lingua: era sempre in italiano
// anche per en/de, ed e' l'ultima cosa che si legge prima di pagare.
// Le tre zone erano indistinguibili ("Intera Zona" per tutte): ora sono nominate.
const PRODUCT_DISPLAY_NAME: Record<Lang, Record<ProductSlug, string>> = {
  it: {
    single:              'Guida Localis',
    custom:              'Localis - Selezione personalizzata',
    tris:                'Localis - Pack 3 Guide',
    sestina:             'Localis - Pack 6 Guide',
    'puglia-completa':   'Puglia Completa — 18 guide',
    'bari-completa':     'Localis - Pack 6 Guide — Bari (Intera Zona)',
    'valle-completa':    'Localis - Pack 6 Guide — Valle d’Itria (Intera Zona)',
    'gargano-completa':  'Localis - Pack 6 Guide — Gargano (Intera Zona)',
    crociera:            'Pacchetto Crociera Localis',
  },
  en: {
    single:              'Localis Guide',
    custom:              'Localis - Custom selection',
    tris:                'Localis - Pack 3 Guides',
    sestina:             'Localis - Pack 6 Guides',
    'puglia-completa':   'Complete Puglia — 18 guides',
    'bari-completa':     'Localis - Pack 6 Guides — Bari (Complete Area)',
    'valle-completa':    'Localis - Pack 6 Guides — Valle d’Itria (Complete Area)',
    'gargano-completa':  'Localis - Pack 6 Guides — Gargano (Complete Area)',
    crociera:            'Localis Cruise Pack',
  },
  de: {
    single:              'Localis Guide',
    custom:              'Localis - Individuelle Auswahl',
    tris:                'Localis - Pack 3',
    sestina:             'Localis - Pack 6',
    'puglia-completa':   'Ganz Puglia — 18 Guides',
    'bari-completa':     'Localis - Pack 6 — Bari (Komplette Zone)',
    'valle-completa':    'Localis - Pack 6 — Valle d’Itria (Komplette Zone)',
    'gargano-completa':  'Localis - Pack 6 — Gargano (Komplette Zone)',
    crociera:            'Localis Kreuzfahrt-Paket',
  },
};

// Stessa riga descrittiva di prima, tradotta. "racconti audio" e non
// "audioguide": BRAND.md vieta "audioguida" nel copy visibile.
function productDescription(lang: Lang, count: number): string {
  if (lang === 'en') return `Localis · ${count} audio stories · Puglia`;
  if (lang === 'de') return `Localis · ${count} Audio-Geschichten · Apulien`;
  return `Localis · ${count} racconti audio · Puglia`;
}

const STORED_PRICE_PRODUCTS = new Set<ProductSlug>(['single', 'crociera']);

function normalizeLang(value: string | undefined): Lang {
  if (value === 'en' || value === 'de') return value;
  return 'it';
}

// Consenso art. 59 lett. o Cod. Consumo (= art. 16 m dir. 2011/83/UE): per i
// contenuti digitali senza supporto fisico il recesso si estingue solo se il
// consumatore (a) chiede l'esecuzione immediata e (b) prende atto della perdita
// del recesso. Lo agganciamo alla casella ToS già obbligatoria: Stripe registra
// consent.terms_of_service='accepted' nella sessione = prova su supporto durevole.
const WAIVER_MESSAGE: Record<Lang, string> = {
  it: 'Spuntando accetto i Termini, chiedo l’esecuzione immediata della guida digitale e prendo atto che, una volta sbloccato l’audio, perdo il diritto di recesso (art. 59, lett. o, D.Lgs. 206/2005).',
  en: 'By checking this box I accept the Terms, request immediate delivery of the digital guide, and acknowledge that once the audio is unlocked I lose my right of withdrawal (Art. 16(m), Directive 2011/83/EU).',
  de: 'Mit dem Häkchen akzeptiere ich die AGB, verlange die sofortige Bereitstellung des digitalen Guides und nehme zur Kenntnis, dass mein Widerrufsrecht mit dem Freischalten des Audios erlischt (Art. 16 m, Richtlinie 2011/83/EU).',
};

function isConfiguredConnectAccount(accountId: string | null | undefined): accountId is string {
  return typeof accountId === 'string' && !accountId.includes('REPLACE_WITH_REAL_CONNECT_ID');
}

function sameSlugSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((slug) => bSet.has(slug));
}

function resolveFixedSlugs(product: ProductSlug): string[] | null {
  if (product === 'puglia-completa')  return [...ALL_GUIDES];
  if (product === 'bari-completa')    return [...BARI_GUIDES];
  if (product === 'valle-completa')   return [...VALLE_GUIDES];
  if (product === 'gargano-completa') return [...GARGANO_GUIDES];
  if (product === 'crociera')         return [...CROCIERA_GUIDES];
  return null;
}

export const POST: APIRoute = async ({ request, cookies, url }) => {
  if (!hasAllowedOrigin(request, url.origin)) {
    return jsonError(403, 'Forbidden origin');
  }

  const redirectMode = url.searchParams.get('redirect') === '1';

  let body: {
    product?: string;
    selectedSlugs?: string[];
    guideSlug?: string;
    lang?: string;
    partnerId?: string;
    gaClientId?: string;
    internal?: string;
  };
  try {
    body = await parseCheckoutRequest(request);
  } catch {
    return redirectMode
      ? redirectError(url.origin, '/guide?checkoutError=1')
      : jsonError(400, 'Invalid checkout payload');
  }

  const product = body.product as ProductSlug | undefined;
  const lang = normalizeLang(body.lang);

  if (!product || !VALID_PRODUCTS.has(product)) {
    return redirectMode
      ? redirectError(url.origin, fallbackCheckoutErrorPath(lang, product, body.guideSlug))
      : jsonError(400, 'Missing or invalid product');
  }

  let guide_slugs: string[];
  const fixedSlugs = resolveFixedSlugs(product);
  if (fixedSlugs) {
    // I prodotti a contenuto fisso hanno la loro lista, ma se il client ne ha
    // mandata una diversa NON la si sostituisce in silenzio: si rifiuta. Prima
    // chi selezionava 17 guide + Matera comprava "Puglia Completa" e riceveva
    // le 18 standard — senza Matera e con dentro una guida che aveva tolto.
    const requested = body.selectedSlugs ?? [];
    if (requested.length > 0 && !sameSlugSet(requested, fixedSlugs)) {
      return redirectMode
        ? redirectError(url.origin, fallbackCheckoutErrorPath(lang, product, requested[0]))
        : jsonError(400, `${product} does not match the selected guides`);
    }
    guide_slugs = fixedSlugs;
  } else if (product === 'single') {
    const slug = body.guideSlug ?? body.selectedSlugs?.[0];
    if (!slug) {
      return redirectMode
        ? redirectError(url.origin, fallbackCheckoutErrorPath(lang, product, body.guideSlug))
        : jsonError(400, 'single requires guideSlug');
    }
    guide_slugs = [slug];
  } else {
    guide_slugs = body.selectedSlugs ?? [];
  }

  try {
    validateSelectedSlugs(product, guide_slugs);
  } catch (err) {
    return redirectMode
      ? redirectError(url.origin, fallbackCheckoutErrorPath(lang, product, guide_slugs[0]))
      : jsonError(400, err instanceof Error ? err.message : 'Invalid slugs');
  }

  // Cookie oppure payload del client: alcuni browser (Safari restrittivo,
  // webview degli scanner QR) bloccano i cookie scritti via JS — il payload
  // fa da paracadute. In entrambi i casi getActivePartner valida lo slug.
  const partner_id_raw = cookies.get('lg_partner')?.value || body.partnerId || null;
  const siteUrl = (process.env.PUBLIC_SITE_URL || url.origin).replace(/\/$/, '');

  let partnerStripeAccount: string | null = null;
  let resolvedPartnerId: string | null = null;
  let partnerCommissionRate = 0;
  if (partner_id_raw) {
    const partner = await getActivePartner(partner_id_raw);
    if (partner) {
      // L'attribuzione della vendita (metadata -> webhook -> registro payout)
      // NON dipende da Stripe Connect: i partner sono liquidati manualmente.
      // Connect, se configurato, aggiunge solo il transfer automatico.
      resolvedPartnerId = partner.data.slug;
      partnerCommissionRate = partner.data.commission_rate;
      if (isConfiguredConnectAccount(partner.data.stripe_account_id)) {
        partnerStripeAccount = partner.data.stripe_account_id;
      }
    } else {
      console.warn(`[checkout] partner cookie "${partner_id_raw}" non corrisponde a un partner attivo — vendita non attribuita`);
    }
  }

  // priceForProduct applica il cap: una selezione libera non costa mai piu'
  // del modo piu' economico di ottenere almeno quelle guide.
  const totalCents = priceForProduct(product, guide_slugs.length);

  const lineItem: Record<string, unknown> = {};
  if (STORED_PRICE_PRODUCTS.has(product)) {
    let priceId: string;
    try {
      priceId = getStripePrice(product as 'single' | 'crociera');
    } catch {
      return redirectMode
        ? redirectError(url.origin, fallbackCheckoutErrorPath(lang, product, guide_slugs[0]))
        : jsonError(400, `Stripe price not configured for ${product}`);
    }
    Object.assign(lineItem, { price: priceId, quantity: 1 });
  } else {
    Object.assign(lineItem, {
      price_data: {
        currency: 'eur',
        unit_amount: totalCents,
        product_data: {
          name: PRODUCT_DISPLAY_NAME[lang][product],
          description: productDescription(lang, guide_slugs.length),
          metadata: { product },
        },
      },
      quantity: 1,
    });
  }

  const sessionParams: Record<string, unknown> = {
    mode: 'payment',
    // Niente payment_method_types hardcoded: Stripe mostra i metodi attivi
    // in dashboard (carta + wallet; PayPal/Klarna attivabili senza deploy).
    line_items: [lineItem],
    customer_creation: 'if_required',
    locale: lang,
    automatic_tax: { enabled: true },
    consent_collection: { terms_of_service: 'required' },
    custom_text: {
      terms_of_service_acceptance: { message: WAIVER_MESSAGE[lang] },
    },
    allow_promotion_codes: true,
    metadata: {
      product,
      guide_slugs: guide_slugs.join(','),
      partner_id: resolvedPartnerId ?? '',
      // Snapshot per il calcolo payout e per la diagnosi di cookie non risolti.
      partner_commission_rate: resolvedPartnerId ? String(partnerCommissionRate) : '',
      partner_cookie: partner_id_raw ?? '',
      lang,
      // GA4 client_id per agganciare il purchase server-side alla sessione del
      // compratore; 'internal'=1 marca gli acquisti di test del founder.
      ga_client_id: body.gaClientId ?? '',
      internal: body.internal === '1' ? '1' : '',
    },
    success_url: `${siteUrl}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${siteUrl}${cancelPathFor(lang, product, guide_slugs[0])}`,
  };

  if (partnerStripeAccount) {
    sessionParams['payment_intent_data'] = {
      transfer_data: {
        destination: partnerStripeAccount,
        amount: Math.floor(totalCents * partnerCommissionRate),
      },
    };
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(sessionParams as Stripe.Checkout.SessionCreateParams);

    // begin_checkout lato server: il gemello client parte solo dopo il consenso
    // cookie, mentre purchase (dal webhook) parte sempre. Senza questo l'imbuto
    // in GA4 mostra piu' acquisti che avvii. Deduplicato via transaction_id.
    // Ha un timeout stretto e non puo' propagare errori: non deve mai
    // ritardare o rompere il pagamento.
    await sendGa4BeginCheckout({
      clientId: body.gaClientId || null,
      transactionId: session.id,
      valueCents: totalCents,
      currency: 'eur',
      guideSlugs: guide_slugs,
      product,
      partnerId: resolvedPartnerId,
      lang,
      trafficType: body.internal === '1' ? 'internal' : undefined,
    }).catch((err: unknown) => {
      // La funzione gestisce gia' i propri errori, ma sta nel percorso che
      // incassa: se un giorno lanciasse, un guasto di GA4 impedirebbe di
      // pagare. Qui la vendita vince sempre sulla sua misura.
      console.error('[checkout] begin_checkout GA4 non inviato:', err instanceof Error ? err.message : 'unknown');
    });

    if (redirectMode) {
      if (!session.url) {
        return redirectError(url.origin, fallbackCheckoutErrorPath(lang, product, guide_slugs[0]));
      }
      return Response.redirect(session.url, 303);
    }
    return new Response(JSON.stringify({ url: session.url }), {
      headers: jsonHeaders(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[checkout]', msg);
    return redirectMode
      ? redirectError(url.origin, fallbackCheckoutErrorPath(lang, product, guide_slugs[0]))
      : jsonError(500, 'Checkout creation failed');
  }
};

async function parseCheckoutRequest(request: Request): Promise<{
  product?: string;
  selectedSlugs?: string[];
  guideSlug?: string;
  lang?: string;
  partnerId?: string;
  gaClientId?: string;
  internal?: string;
}> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return await request.json();
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await request.formData();
    return {
      product: readFormValue(form, 'product'),
      guideSlug: readFormValue(form, 'guideSlug'),
      lang: readFormValue(form, 'lang'),
      partnerId: readFormValue(form, 'partnerId'),
      gaClientId: readFormValue(form, 'gaClientId'),
      internal: readFormValue(form, 'internal'),
      selectedSlugs: form.getAll('selectedSlugs').map(String).filter(Boolean),
    };
  }

  throw new Error('Unsupported content type');
}

function readFormValue(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function cancelPathFor(lang: Lang, product: ProductSlug, firstGuideSlug: string): string {
  if (product === 'custom' || product === 'tris' || product === 'sestina' || product === 'puglia-completa') {
    if (lang === 'de') return '/de/guide#builder';
    if (lang === 'en') return '/en/guide#builder';
    return '/guide#builder';
  }

  if (product === 'crociera') {
    if (lang === 'de') return '/de/kreuzfahrt?cancelled=1';
    return lang === 'en' ? '/en/cruise?cancelled=1' : '/crocieristi?cancelled=1';
  }

  // Chi annulla torna sulla guida che stava comprando. Il tedesco finiva sulla
  // home (/de), e la guida se la doveva ricercare: /de/guide/{slug} esiste.
  const prefix = lang === 'it' ? '' : `/${lang}`;
  return `${prefix}/guide/${firstGuideSlug}?cancelled=1`;
}

function fallbackCheckoutErrorPath(
  lang: Lang,
  product: ProductSlug | undefined,
  firstGuideSlug?: string,
): string {
  const basePath = product
    ? cancelPathFor(lang, product, firstGuideSlug || 'bari-vecchia')
    : lang === 'de'
      ? '/de/guide'
      : lang === 'en'
        ? '/en/guide'
        : '/guide';

  return appendCheckoutError(basePath);
}

function appendCheckoutError(path: string): string {
  const divider = path.includes('?') ? '&' : '?';
  return `${path}${divider}checkoutError=1`;
}

function redirectError(origin: string, path: string): Response {
  return Response.redirect(new URL(path, origin), 303);
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: jsonHeaders(),
  });
}

function jsonHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store',
  };
}

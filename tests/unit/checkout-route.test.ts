import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above top-level declarations, so the fns they
// reference must be created via vi.hoisted (otherwise: "Cannot access ...
// before initialization").
const { createSession, getActivePartner } = vi.hoisted(() => ({
  createSession: vi.fn(),
  getActivePartner: vi.fn(),
}));

vi.mock('../../src/lib/stripe', () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: createSession,
      },
    },
  }),
}));

vi.mock('../../src/lib/partners', () => ({
  getActivePartner,
}));

import { POST } from '../../src/pages/api/checkout';
import { ALL_GUIDES, BARI_GUIDES } from '../../src/lib/stripe-prices';

describe('POST /api/checkout', () => {
  beforeEach(() => {
    createSession.mockReset();
    getActivePartner.mockReset();
    getActivePartner.mockResolvedValue(null);
  });

  it('returns a 303 redirect when redirect=1 and form data is posted', async () => {
    createSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/test_session' });

    const params = new URLSearchParams();
    params.set('product', 'bari-completa');
    params.set('lang', 'it');
    for (const slug of BARI_GUIDES) {
      params.append('selectedSlugs', slug);
    }

    const request = new Request('https://localis.guide/api/checkout?redirect=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://localis.guide',
      },
      body: params,
    });

    const response = await POST({
      request,
      cookies: { get: () => undefined },
      url: new URL(request.url),
    } as never);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://checkout.stripe.com/c/pay/test_session');
    expect(createSession).toHaveBeenCalledOnce();
  });

  // Prima chi selezionava 17 guide + Matera comprava "Puglia Completa" a 39,99
  // e riceveva le 18 standard: senza Matera, con dentro una guida che aveva
  // tolto. Il server sovrascriveva la selezione senza dirlo.
  it('refuses a fixed-content product when the selection does not match it', async () => {
    const request = new Request('https://localis.guide/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://localis.guide',
      },
      body: JSON.stringify({
        product: 'puglia-completa',
        selectedSlugs: [...ALL_GUIDES.slice(0, 17), 'matera'],
        lang: 'de',
      }),
    });

    const response = await POST({
      request,
      cookies: { get: () => undefined },
      url: new URL(request.url),
    } as never);

    expect(response.status).toBe(400);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('keeps the JSON response mode for fetch-based callers', async () => {
    createSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/json_mode' });

    const request = new Request('https://localis.guide/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://localis.guide',
      },
      body: JSON.stringify({
        product: 'bari-completa',
        selectedSlugs: [...BARI_GUIDES],
        lang: 'it',
      }),
    });

    const response = await POST({
      request,
      cookies: { get: () => undefined },
      url: new URL(request.url),
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: 'https://checkout.stripe.com/c/pay/json_mode',
    });
  });

  // Regressione 2026-06-11: l'attribuzione finiva nei metadata SOLO se il
  // partner aveva Stripe Connect configurato — con i placeholder
  // "acct_REPLACE..." ogni vendita partner risultava senza partner_id.
  it('attributes the sale to the partner even without a configured Connect account', async () => {
    createSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/attributed' });
    getActivePartner.mockResolvedValue({
      data: {
        slug: 'london-bar-bb',
        stripe_account_id: 'acct_REPLACE_WITH_REAL_CONNECT_ID',
        commission_rate: 0.25,
      },
    });

    const request = new Request('https://localis.guide/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://localis.guide' },
      body: JSON.stringify({ product: 'bari-completa', lang: 'it' }),
    });

    const response = await POST({
      request,
      cookies: { get: (name: string) => (name === 'lg_partner' ? { value: 'london-bar-bb' } : undefined) },
      url: new URL(request.url),
    } as never);

    expect(response.status).toBe(200);
    const sessionParams = createSession.mock.calls[0][0];
    expect(sessionParams.metadata.partner_id).toBe('london-bar-bb');
    expect(sessionParams.metadata.partner_commission_rate).toBe('0.25');
    expect(sessionParams.metadata.partner_cookie).toBe('london-bar-bb');
    // Senza Connect configurato niente transfer automatico (payout manuale).
    expect(sessionParams.payment_intent_data).toBeUndefined();
  });

  // I browser che bloccano i cookie (Safari restrittivo, webview scanner QR)
  // non mandano lg_partner: il payload del client fa da paracadute.
  it('attributes the sale from the body partnerId when the cookie is missing', async () => {
    createSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/no_cookie' });
    getActivePartner.mockResolvedValue({
      data: {
        slug: 'giardino-lido-sole',
        stripe_account_id: 'acct_REPLACE_WITH_REAL_CONNECT_ID',
        commission_rate: 0.25,
      },
    });

    const request = new Request('https://localis.guide/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://localis.guide' },
      body: JSON.stringify({ product: 'bari-completa', lang: 'it', partnerId: 'giardino-lido-sole' }),
    });

    await POST({
      request,
      cookies: { get: () => undefined },
      url: new URL(request.url),
    } as never);

    expect(getActivePartner).toHaveBeenCalledWith('giardino-lido-sole');
    const sessionParams = createSession.mock.calls[0][0];
    expect(sessionParams.metadata.partner_id).toBe('giardino-lido-sole');
    expect(sessionParams.metadata.partner_cookie).toBe('giardino-lido-sole');
  });

  it('adds the Connect transfer only when the partner account is configured', async () => {
    createSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/connect' });
    getActivePartner.mockResolvedValue({
      data: {
        slug: 'infopoint-bari',
        stripe_account_id: 'acct_1RealConnectAccount',
        commission_rate: 0.25,
      },
    });

    const request = new Request('https://localis.guide/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://localis.guide' },
      body: JSON.stringify({ product: 'bari-completa', lang: 'it' }),
    });

    await POST({
      request,
      cookies: { get: (name: string) => (name === 'lg_partner' ? { value: 'infopoint-bari' } : undefined) },
      url: new URL(request.url),
    } as never);

    const sessionParams = createSession.mock.calls[0][0];
    expect(sessionParams.metadata.partner_id).toBe('infopoint-bari');
    expect(sessionParams.payment_intent_data).toEqual({
      transfer_data: {
        destination: 'acct_1RealConnectAccount',
        amount: Math.floor(1999 * 0.25),
      },
    });
  });
});

// La pagina di pagamento mostrava sempre i nomi italiani, anche a en/de: e' la
// schermata subito prima del pagamento, e la discrepanza con il sito e' una
// causa tipica di abbandono.
describe('POST /api/checkout — nomi prodotto per lingua', () => {
  beforeEach(() => {
    createSession.mockReset();
    createSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/i18n' });
    getActivePartner.mockReset();
    getActivePartner.mockResolvedValue(null);
  });

  async function productDataFor(product: string, lang: string) {
    const request = new Request('https://localis.guide/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://localis.guide' },
      body: JSON.stringify({ product, lang }),
    });
    await POST({
      request,
      cookies: { get: () => undefined },
      url: new URL(request.url),
    } as never);
    return createSession.mock.calls[0][0].line_items[0].price_data.product_data;
  }

  it('usa la terminologia tedesca del sito quando lang=de', async () => {
    const pd = await productDataFor('bari-completa', 'de');

    expect(pd.name).toContain('Komplette Zone');
    expect(pd.name).not.toContain('Intera Zona');
    expect(pd.description).toBe('Localis · 6 Audio-Geschichten · Apulien');
  });

  it('usa la terminologia inglese del sito quando lang=en', async () => {
    const pd = await productDataFor('bari-completa', 'en');

    expect(pd.name).toContain('Complete Area');
    expect(pd.description).toBe('Localis · 6 audio stories · Puglia');
  });

  it('non cambia nulla per lang=it', async () => {
    const pd = await productDataFor('bari-completa', 'it');

    expect(pd.name).toContain('Intera Zona');
    expect(pd.description).toBe('Localis · 6 racconti audio · Puglia');
  });

  it('nomina la zona invece di chiamarle tutte "Intera Zona"', async () => {
    const bari = await productDataFor('bari-completa', 'it');
    createSession.mockClear();
    const gargano = await productDataFor('gargano-completa', 'it');

    expect(bari.name).toContain('Bari');
    expect(gargano.name).toContain('Gargano');
    expect(bari.name).not.toBe(gargano.name);
  });

  // BRAND.md: "audioguida" solo in title/meta, mai nel copy visibile.
  it('non usa mai "audioguida" nel copy mostrato su Stripe', async () => {
    for (const lang of ['it', 'en', 'de']) {
      createSession.mockClear();
      const pd = await productDataFor('bari-completa', lang);
      expect(`${pd.name} ${pd.description}`.toLowerCase()).not.toMatch(/audioguid|audioführer/);
    }
  });
});

import type { APIRoute } from 'astro';
import { getStripe } from '../../lib/stripe';
import { generateAccessToken } from '../../lib/jwt';
import { sendEmail } from '../../lib/resend';
import { renderAccessEmailIt } from '../../lib/emails/access-email-it';
import { renderAccessEmailEn } from '../../lib/emails/access-email-en';
import { renderAccessEmailDe } from '../../lib/emails/access-email-de';
import { getCollection } from 'astro:content';
import type { Lang } from '../../lib/i18n';
import type Stripe from 'stripe';
import { guideTitle } from '../../lib/guide-localization';
import { captureServerEvent, hashDistinctId } from '../../lib/posthog';
import { sendGa4Purchase } from '../../lib/ga4-mp';
import { grantEntitlement } from '../../lib/entitlements';
import { maskEmail } from '../../lib/format';

function normalizeLang(value: string | undefined): Lang {
  if (value === 'en' || value === 'de') return value;
  return 'it';
}

export const POST: APIRoute = async ({ request }) => {
  const sig = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return new Response('Missing signature or webhook secret', { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[webhook] Signature verification failed:', msg);
    return new Response(`Signature verification failed: ${msg}`, { status: 400 });
  }

  // Handle relevant events
  if (event.type === 'checkout.session.completed') {
    try {
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error('[webhook] checkout.session.completed handler error:', msg);
      // Return 500 so Stripe retries
      return new Response(`Internal error: ${msg}`, { status: 500 });
    }
  }

  return new Response('OK', { status: 200 });
};

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const email = session.customer_email || session.customer_details?.email;
  const meta = session.metadata || {};

  if (!email) {
    throw new Error(`Session ${session.id} has no customer_email`);
  }

  const guide_slugs = (meta.guide_slugs || '').split(',').filter(Boolean);
  const partner_id = meta.partner_id || null;
  const lang = normalizeLang(meta.lang);
  const product = meta.product || 'unknown';

  if (guide_slugs.length === 0) {
    throw new Error(`Session ${session.id} has no guide_slugs in metadata`);
  }

  // Persist entitlement first so /recover is a single indexed lookup
  // (no Stripe session scan) and survives even if the email send fails.
  await grantEntitlement(email, guide_slugs, partner_id, session.id);

  // Generate magic link
  const token = generateAccessToken({
    email,
    guide_slugs,
    stripe_session_id: session.id,
    partner_id,
  });

  const siteUrl = (process.env.PUBLIC_SITE_URL || 'https://localis.guide').replace(/\/$/, '');
  const accessUrl = `${siteUrl}/access/${token}?lang=${lang}`;

  // Look up guide titles in correct language
  const guides = await getCollection('guides');
  const guideTitles = guide_slugs.map((slug) => {
    const g = guides.find((g) => g.data.slug === slug);
    if (!g) return slug;
    return guideTitle(g.data, lang);
  });

  await captureServerEvent('purchase_completed', hashDistinctId(email), {
    product,
    guide_count: guide_slugs.length,
    guide_slugs: guide_slugs.join(','),
    partner_id,
    lang,
    stripe_session_id: session.id,
    revenue_cents: session.amount_total ?? null,
    currency: session.currency ?? 'eur',
  });

  // GA4 server-side: il `purchase` parte SEMPRE alla conferma del pagamento,
  // anche se il compratore non torna su /thanks. Deduplicato dal client-side
  // via transaction_id = session.id. Non-bloccante: errori solo loggati.
  await sendGa4Purchase({
    clientId: meta.ga_client_id || null,
    transactionId: session.id,
    valueCents: session.amount_total ?? null,
    currency: session.currency ?? 'eur',
    guideSlugs: guide_slugs,
    product,
    partnerId: partner_id,
    lang,
    trafficType: meta.internal === '1' ? 'internal' : undefined,
  });

  // L'email per ultima: e' l'unico passo che dipende da un servizio esterno e
  // puo' far fallire l'handler (500 -> Stripe ritenta). Quando stava prima, un
  // guasto di Resend si portava via anche la misura di un acquisto gia' pagato.
  const { subject, html, text } = lang === 'it'
    ? renderAccessEmailIt({ accessUrl, guideTitles })
    : lang === 'de'
      ? renderAccessEmailDe({ accessUrl, guideTitles })
      : renderAccessEmailEn({ accessUrl, guideTitles });

  await sendEmail({ to: email, subject, html, text });

  console.log(`[webhook] Sent access email to ${maskEmail(email)} for guides ${guide_slugs.join(', ')}`);

  // Stripe Connect partner attribution log (Milestone E adds full split logic)
  if (partner_id) {
    console.log(`[webhook] Partner ${partner_id} attributed sale of session ${session.id}`);
  }
}

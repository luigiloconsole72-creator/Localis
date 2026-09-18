import { defineMiddleware } from 'astro:middleware';
import { BOT } from './lib/bots';
import { kvHIncrBy } from './lib/kv';
import {
  LANG_COOKIE_NAME,
  allLangUrls,
  getPathLang,
  getPreferredLangFromHeader,
  isPublicHtmlPath,
  isSupportedLang,
} from './lib/i18n';

const PARTNER_COOKIE_NAME = 'lg_partner';

// Conteggio scansioni QR indipendente dal consenso cookie: GA4 e PostHog
// partono solo dopo l'accettazione e vedono una frazione del traffico
// (misurato: 5 scansioni su 34). Aggregato per giorno, nessun IP, nessun
// identificatore: un contatore per partner e per codice stampato.
//
// Qui stanno solo le scansioni. Le pagine viste di tutto il sito le conta
// /api/hit, perche' le pagine prerenderizzate non arrivano mai al middleware:
// un solo scrittore per metrica, cosi' niente doppi conteggi.
export async function countScan(request: Request, pathname: string, res: Response): Promise<void> {
  try {
    if (request.method !== 'GET' || res.status !== 200) return;
    // Solo pagine: esclude asset, JSON e feed.
    if (!/^text\/html/i.test(res.headers.get('content-type') || '')) return;
    const url = new URL(request.url);
    if (url.searchParams.get('localis_internal') === '1') return; // canary/test interni
    // Il controllo su user-agent vuoto non e' solo anti-bot, regge anche il
    // build: Astro esegue il middleware mentre prerenderizza le pagine statiche
    // (misurato: 183 esecuzioni per build) e lo fa con user-agent assente. Senza
    // questa riga ogni deploy scriverebbe conteggi inventati.
    const ua = request.headers.get('user-agent') || '';
    if (!ua || BOT.test(ua)) return;

    const partnerMatch = pathname.match(/^\/(?:en\/|de\/)?p\/([a-z0-9][a-z0-9-]{2,40})\/?$/i);
    const codeMatch = pathname.match(/^\/q\/([a-z0-9]{4,12})\/?$/i);
    const scanKey = partnerMatch
      ? partnerMatch[1].toLowerCase()
      : codeMatch ? `q:${codeMatch[1].toLowerCase()}` : null;
    if (!scanKey) return;

    await kvHIncrBy('scan-counts', new Date().toISOString().slice(0, 10), scanKey);
  } catch {
    /* un contatore che fallisce non deve mai impedire la pagina */
  }
}
const MAX_AGE_DAYS = 30;
const MAX_AGE_SECONDS = MAX_AGE_DAYS * 24 * 60 * 60;

export const onRequest = defineMiddleware(async (context, next) => {
  const url = context.url;
  const pathname = url.pathname;
  if (!['GET', 'HEAD'].includes(context.request.method) || !isPublicHtmlPath(pathname)) {
    return next();
  }

  // Conta solo le pagine servite davvero: i redirect qui sotto non sono una
  // visita, lo sara' la richiesta che li segue.
  const proceed = async () => {
    const res = await next();
    await countScan(context.request, pathname, res);
    return res;
  };

  // Le card QR neutre non hanno una versione per lingua: /de/q/{codice} e
  // /en/q/{codice} non esistono, e mandarci un turista significa dargli un 404
  // con la card in mano. La lingua la decide la pagina di arrivo, dopo il salto
  // su /p/{slug}. (Regressione del 18/09: passando /q/ a SSR si era acceso
  // anche il redirect lingua, prima spento perche' la pagina era statica.)
  if (/^\/q\/[^/]+\/?$/i.test(pathname)) return proceed();

  const cookieOptions = {
    path: '/',
    maxAge: MAX_AGE_SECONDS,
    sameSite: 'lax' as const,
    secure: import.meta.env.PROD,
    httpOnly: false,
  };

  const partnerFromQuery = url.searchParams.get('p');
  if (partnerFromQuery && /^[a-z0-9][a-z0-9-]{2,40}$/i.test(partnerFromQuery)) {
    context.cookies.set(PARTNER_COOKIE_NAME, partnerFromQuery, cookieOptions);
  }

  const queryLang = url.searchParams.get('lang');
  if (isSupportedLang(queryLang)) {
    context.cookies.set(LANG_COOKIE_NAME, queryLang, cookieOptions);
  }

  const redirectTo = (targetPath: string) => {
    const redirectUrl = new URL(url);
    redirectUrl.pathname = targetPath;
    redirectUrl.searchParams.delete('lang');
    return context.redirect(redirectUrl.toString(), 302);
  };

  // I QR partner puntano alla landing /p/{slug} (ripristino 2026-06-12: i
  // vecchi redirect verso la home disperdevano il traffico). Le landing sono
  // prerenderizzate, quindi questo set serve solo ai path serviti dalla
  // function; sul percorso statico il cookie lo mette il client (Layout) e
  // al checkout c'è comunque il partnerId nel payload.
  const partnerPathMatch = pathname.match(/^\/(?:(it|en|de)\/)?p\/([a-z0-9][a-z0-9-]{2,40})\/?$/i);
  if (partnerPathMatch) {
    context.cookies.set(PARTNER_COOKIE_NAME, partnerPathMatch[2], cookieOptions);
  }

  if (isSupportedLang(queryLang)) {
    const targetPath = allLangUrls(pathname)[queryLang];
    if (targetPath !== pathname || url.searchParams.has('lang')) {
      return redirectTo(targetPath);
    }
    return proceed();
  }

  const pathLang = getPathLang(pathname);
  if (pathLang) {
    context.cookies.set(LANG_COOKIE_NAME, pathLang, cookieOptions);
    return proceed();
  }

  const cookieLang = context.cookies.get(LANG_COOKIE_NAME)?.value;
  const preferredLang = isSupportedLang(cookieLang)
    ? cookieLang
    : getPreferredLangFromHeader(context.request.headers.get('accept-language'));

  if (preferredLang !== 'it') {
    context.cookies.set(LANG_COOKIE_NAME, preferredLang, cookieOptions);
    return redirectTo(allLangUrls(pathname)[preferredLang]);
  }

  return proceed();
});

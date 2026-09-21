import type { AstroGlobal } from 'astro';

export type Lang = 'it' | 'en' | 'de';
export const LANG_COOKIE_NAME = 'lg_lang';
const SUPPORTED_LANGS: Lang[] = ['it', 'en', 'de'];

/**
 * Get current language from Astro context.
 */
export function getLang(astro: AstroGlobal): Lang {
  return (astro.currentLocale as Lang) || 'it';
}

export function isSupportedLang(value: string | null | undefined): value is Lang {
  return value === 'it' || value === 'en' || value === 'de';
}

/**
 * Build a localized URL given current lang and target path.
 * Italian (default) has no prefix; EN uses /en/, DE uses /de/.
 *
 * @example
 *   localizedHref('/guide/bari-vecchia', 'it') === '/guide/bari-vecchia'
 *   localizedHref('/guide/bari-vecchia', 'en') === '/en/guide/bari-vecchia'
 *   localizedHref('/guide/bari-vecchia', 'de') === '/de/guide/bari-vecchia'
 */
export function localizedHref(path: string, lang: Lang): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (lang === 'it') return normalized;
  return `/${lang}${normalized}`;
}

export function getPathLang(path: string): Exclude<Lang, 'it'> | null {
  const match = path.match(/^\/(en|de)(?:\/|$)/);
  if (!match) return null;
  return match[1] as Exclude<Lang, 'it'>;
}

/**
 * Strip locale prefix from path. Useful for building lang-switcher links.
 *
 * @example
 *   stripLocalePrefix('/en/guide/bari-vecchia') === '/guide/bari-vecchia'
 *   stripLocalePrefix('/de/bari') === '/bari'
 *   stripLocalePrefix('/guide/bari-vecchia') === '/guide/bari-vecchia'
 */
export function stripLocalePrefix(path: string): string {
  return path.replace(/^\/(en|de)\b/, '') || '/';
}

/**
 * Get the alternate language pair URL for hreflang tags (IT ↔ EN, legacy use).
 */
export function alternateLangUrl(currentPath: string, currentLang: Lang): string {
  const stripped = stripLocalePrefix(currentPath);
  const targetLang: Lang = currentLang === 'it' ? 'en' : 'it';
  return localizedHref(stripped, targetLang);
}

/** Pages where the slug differs across languages. Key = IT slug (no prefix). */
const SLUG_MAP: Record<string, { en: string; de: string }> = {
  '/metodo':           { en: '/method',           de: '/methode' },
  '/method':           { en: '/method',           de: '/methode' },
  '/methode':          { en: '/method',           de: '/methode' },
  '/crocieristi':      { en: '/cruise',           de: '/kreuzfahrt' },
  '/cruise':           { en: '/cruise',           de: '/kreuzfahrt' },
  '/kreuzfahrt':       { en: '/cruise',           de: '/kreuzfahrt' },
  '/diventa-partner':  { en: '/become-a-partner', de: '/partner-werden' },
  '/become-a-partner': { en: '/become-a-partner', de: '/partner-werden' },
  '/partner-werden':   { en: '/become-a-partner', de: '/partner-werden' },
};

/**
 * Append a trailing slash to keep hreflang URLs aligned with the canonical
 * (Netlify pretty-URLs 301s every path to its trailing-slash form). The root
 * path stays as-is.
 */
function withTrailingSlash(path: string): string {
  if (path === '/') return path;
  return path.endsWith('/') ? path : `${path}/`;
}

/**
 * Returns URLs for all 3 language versions of the current path.
 * Output URLs carry a trailing slash so they match the page canonical.
 */
export function allLangUrls(currentPath: string): Record<Lang, string> {
  const stripped = stripLocalePrefix(currentPath).replace(/\/$/, '') || '/';
  const map = SLUG_MAP[stripped];
  const raw: Record<Lang, string> = map
    ? {
        it: stripped === '/method' || stripped === '/methode'
          ? '/metodo'
          : stripped === '/cruise' || stripped === '/kreuzfahrt'
            ? '/crocieristi'
            : stripped === '/become-a-partner' || stripped === '/partner-werden'
              ? '/diventa-partner'
              : stripped,
        en: `/en${map.en}`,
        de: `/de${map.de}`,
      }
    : {
        it: localizedHref(stripped, 'it'),
        en: localizedHref(stripped, 'en'),
        de: localizedHref(stripped, 'de'),
      };
  return {
    it: withTrailingSlash(raw.it),
    en: withTrailingSlash(raw.en),
    de: withTrailingSlash(raw.de),
  };
}

export function getPreferredLangFromHeader(header: string | null): Lang {
  if (!header) return 'it';

  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tagPart, ...params] = part.trim().split(';');
      const baseTag = tagPart.toLowerCase().split('-')[0];
      const qParam = params.find((param) => param.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;

      return {
        lang: isSupportedLang(baseTag) ? baseTag : null,
        q: Number.isFinite(q) ? q : 0,
        index,
      };
    })
    .filter((entry): entry is { lang: Lang; q: number; index: number } => entry.lang !== null)
    .sort((a, b) => (b.q - a.q) || (a.index - b.index));

  return ranked[0]?.lang ?? 'it';
}

// Rotte servite dalla function che NON hanno una versione per lingua: il
// redirect linguistico le manderebbe su un path inesistente (/de/thanks = 404,
// misurato il 21/09 su ogni compratore con cookie lg_lang != it). Decidono la
// lingua da sole: /thanks dai metadata Stripe, /access/ dal querystring del
// magic link. Le pagine prerenderizzate non passano di qui (su Vercel le serve
// la CDN), quindi l'elenco copre solo le pagine SSR.
export function isPublicHtmlPath(pathname: string): boolean {
  if (
    pathname.startsWith('/api/')
    || pathname.startsWith('/access/')
    || pathname.startsWith('/_astro/')
    || pathname === '/thanks'
    || pathname.startsWith('/thanks/')
    || pathname.startsWith('/admin/')
    || pathname.startsWith('/partner/')
  ) {
    return false;
  }

  return !/\.[a-z0-9]+$/i.test(pathname);
}

export function withLangQuery(href: string, lang: Lang): string {
  const url = new URL(href, 'https://localis.guide');
  url.searchParams.set('lang', lang);
  return `${url.pathname}${url.search}${url.hash}`;
}

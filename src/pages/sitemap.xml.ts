import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const prerender = true;

type Lang = 'it' | 'en' | 'de';

interface SitemapEntry {
  path: string;
  changefreq?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority?: number;
  lastmod?: Date;
  alternates?: Partial<Record<Lang, string>>;
}

const localizedPages: Array<{ it: string; en: string; de: string; priority: number }> = [
  { it: '/', en: '/en/', de: '/de/', priority: 1 },
  { it: '/bari/', en: '/en/bari/', de: '/de/bari/', priority: 0.9 },
  { it: '/valle-d-itria/', en: '/en/valle-d-itria/', de: '/de/valle-d-itria/', priority: 0.9 },
  { it: '/gargano/', en: '/en/gargano/', de: '/de/gargano/', priority: 0.9 },
  { it: '/guide/', en: '/en/guide/', de: '/de/guide/', priority: 0.85 },
  { it: '/crocieristi/', en: '/en/cruise/', de: '/de/kreuzfahrt/', priority: 0.75 },
  { it: '/metodo/', en: '/en/method/', de: '/de/methode/', priority: 0.65 },
  { it: '/fonti/', en: '/en/fonti/', de: '/de/fonti/', priority: 0.6 },
  { it: '/faq/', en: '/en/faq/', de: '/de/faq/', priority: 0.55 },
  { it: '/about/', en: '/en/about/', de: '/de/about/', priority: 0.5 },
  { it: '/blog/', en: '/en/blog/', de: '/de/blog/', priority: 0.65 },
  { it: '/diventa-partner/', en: '/en/become-a-partner/', de: '/de/partner-werden/', priority: 0.45 },
  { it: '/privacy/', en: '/en/privacy/', de: '/de/privacy/', priority: 0.25 },
  { it: '/termini/', en: '/en/termini/', de: '/de/termini/', priority: 0.25 },
  { it: '/cookie-policy/', en: '/en/cookie-policy/', de: '/de/cookie-policy/', priority: 0.25 },
];

const localePath = (path: string, lang: Lang) => {
  if (lang === 'it') return path;
  return `/${lang}${path}`;
};

const normalizeDate = (date: Date) => date.toISOString().split('T')[0];

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const absoluteUrl = (path: string, site: URL) => new URL(path, site).toString();

const renderUrl = (entry: SitemapEntry, site: URL) => {
  const alternates = entry.alternates
    ? Object.entries(entry.alternates)
        .map(([lang, path]) =>
          path
            ? `    <xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(absoluteUrl(path, site))}" />`
            : '',
        )
        .filter(Boolean)
        .join('\n')
    : '';

  const xDefault = entry.alternates?.it
    ? `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(absoluteUrl(entry.alternates.it, site))}" />`
    : '';

  return `  <url>
    <loc>${escapeXml(absoluteUrl(entry.path, site))}</loc>
${entry.lastmod ? `    <lastmod>${normalizeDate(entry.lastmod)}</lastmod>\n` : ''}${entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>\n` : ''}${entry.priority ? `    <priority>${entry.priority.toFixed(2)}</priority>\n` : ''}${alternates ? `${alternates}\n` : ''}${xDefault ? `${xDefault}\n` : ''}  </url>`;
};

export const GET: APIRoute = async ({ site }) => {
  const baseSite = site ?? new URL('https://localis.guide');
  const guides = await getCollection('guides', (guide) => guide.data.status === 'live');
  const blog = await getCollection('blog', (article) => article.data.status === 'published');

  const entries: SitemapEntry[] = localizedPages.flatMap((page) => {
    const alternates = { it: page.it, en: page.en, de: page.de };
    return (['it', 'en', 'de'] as Lang[]).map((lang) => ({
      path: page[lang],
      changefreq: 'monthly',
      priority: page.priority,
      alternates,
    }));
  });

  for (const guide of guides) {
    const path = `/guide/${guide.data.slug}/`;
    const alternates = {
      it: path,
      en: `/en${path}`,
      de: `/de${path}`,
    };

    entries.push(
      ...(['it', 'en', 'de'] as Lang[]).map((lang) => ({
        path: localePath(path, lang),
        changefreq: 'weekly' as const,
        priority: 0.85,
        lastmod: guide.data.published_at,
        alternates,
      })),
    );
  }

  for (const article of blog) {
    const d = article.data;
    const alternates: Partial<Record<Lang, string>> = {
      it: blog.some((entry) => entry.data.lang === 'it' && entry.data.slug === d.slug_it)
        ? `/blog/${d.slug_it}/`
        : undefined,
      en: blog.some((entry) => entry.data.lang === 'en' && entry.data.slug === d.slug_en)
        ? `/en/blog/${d.slug_en}/`
        : undefined,
      de: d.slug_de && blog.some((entry) => entry.data.lang === 'de' && entry.data.slug === d.slug_de)
        ? `/de/blog/${d.slug_de}/`
        : undefined,
    };
    const path =
      d.lang === 'it'
        ? `/blog/${d.slug}/`
        : d.lang === 'en'
          ? `/en/blog/${d.slug}/`
          : `/de/blog/${d.slug}/`;

    entries.push({
      path,
      changefreq: 'monthly',
      priority: 0.7,
      lastmod: d.updated_at ?? d.published_at,
      alternates,
    });
  }

  // Masserie: solo italiano, finché i racconti non sono tradotti
  const masserie = await getCollection('masserie', (m) => m.data.status === 'published');
  if (masserie.length) {
    entries.push({ path: '/masserie/', changefreq: 'weekly', priority: 0.6, alternates: { it: '/masserie/' } });
  }
  for (const m of masserie) {
    const path = `/masserie/${m.data.slug}/`;
    entries.push({ path, changefreq: 'monthly', priority: 0.6, lastmod: m.data.published_at, alternates: { it: path } });
  }

  const seen = new Set<string>();
  const uniqueEntries = entries.filter((entry) => {
    if (seen.has(entry.path)) return false;
    seen.add(entry.path);
    return true;
  });

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${uniqueEntries.map((entry) => renderUrl(entry, baseSite)).join('\n')}
</urlset>
`,
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
};

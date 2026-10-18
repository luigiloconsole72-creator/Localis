import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const guides = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/guides' }),
  schema: z.object({
    slug: z.string(),
    city: z.enum([
      'bari',
      'polignano',
      'ostuni',
      'lecce',
      'matera',
      'trani',
      'otranto',
      'gallipoli',
      'alberobello',
      'locorotondo',
      'martina-franca',
      'cisternino',
      'ostuni',
      'fasano',
      'vieste',
      'gargano',
    ]),
    title_it: z.string(),
    title_en: z.string(),
    title_de: z.string().optional(),
    title_fr: z.string().optional(),
    title_pl: z.string().optional(),
    subtitle_it: z.string(),
    subtitle_en: z.string(),
    subtitle_de: z.string().optional(),
    subtitle_fr: z.string().optional(),
    subtitle_pl: z.string().optional(),
    duration_seconds: z.number().int().nonnegative(),
    duration_seconds_en: z.number().int().nonnegative().optional(),
    duration_seconds_de: z.number().int().nonnegative().optional(),
    duration_seconds_fr: z.number().int().nonnegative().optional(),
    duration_seconds_pl: z.number().int().nonnegative().optional(),
    cover: z.string(),
    audio_full_key_it: z.string(),
    audio_full_key_en: z.string(),
    audio_full_key_de: z.string().optional(),
    audio_full_key_fr: z.string().optional(),
    audio_full_key_pl: z.string().optional(),
    // Base path dell'anteprima audio (senza -{lang}.mp3). Es: /audio/trailers/bari/bari-vecchia-trailer
    preview_audio_base: z.string().optional(),
    chapters: z
      .array(
        z.object({
          title_it: z.string(),
          title_en: z.string(),
          title_de: z.string().optional(),
          title_fr: z.string().optional(),
          title_pl: z.string().optional(),
          start_seconds: z.number().int().nonnegative(),
          start_seconds_en: z.number().int().nonnegative().optional(),
          start_seconds_de: z.number().int().nonnegative().optional(),
          start_seconds_fr: z.number().int().nonnegative().optional(),
          start_seconds_pl: z.number().int().nonnegative().optional(),
        }),
      )
      .min(1),
    coords_start: z
      .object({
        lat: z.number(),
        lng: z.number(),
      })
      .optional(),
    narrator: z
      .object({
        name: z.string(),
        photo: z.string(),
        bio_it: z.string(),
        bio_en: z.string(),
        bio_de: z.string().optional(),
        bio_fr: z.string().optional(),
        bio_pl: z.string().optional(),
      })
      .optional(),
    distance_km: z.number().positive().optional(),
    stops_count: z.number().int().positive().optional(),
    route_mode_it: z.string().optional(),
    route_mode_en: z.string().optional(),
    route_mode_de: z.string().optional(),
    route_mode_fr: z.string().optional(),
    route_mode_pl: z.string().optional(),
    accessibility_it: z.string().optional(),
    accessibility_en: z.string().optional(),
    accessibility_de: z.string().optional(),
    accessibility_fr: z.string().optional(),
    accessibility_pl: z.string().optional(),
    needs_it: z.string().optional(),
    needs_en: z.string().optional(),
    needs_de: z.string().optional(),
    needs_fr: z.string().optional(),
    needs_pl: z.string().optional(),
    use_case_intro_it: z.string().optional(),
    use_case_intro_en: z.string().optional(),
    use_case_intro_de: z.string().optional(),
    use_case_intro_fr: z.string().optional(),
    use_case_intro_pl: z.string().optional(),
    price_cents: z.number().int().default(499),
    status: z.enum(['live', 'soon', 'archived']).default('live'),
    published_at: z.date(),
    seo: z.object({
      description_it: z.string().max(160),
      description_en: z.string().max(160),
      description_de: z.string().max(160).optional(),
      description_fr: z.string().max(160).optional(),
      description_pl: z.string().max(160).optional(),
    }),
  }),
});

const partners = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/partners' }),
  schema: z.object({
    slug: z.string(),
    display_name: z.string(),
    type: z.enum(['hotel', 'bb', 'bar', 'restaurant', 'shop', 'other']),
    city: z.string(),
    contact_email: z.email(),
    stripe_account_id: z.string().regex(/^acct_/),
    commission_rate: z.number().min(0).max(0.5).default(0.25),
    agent: z.string().optional(),
    created_at: z.date(),
    status: z.enum(['active', 'paused', 'terminated']),
    reporting_mode: z.enum(['physical_qr', 'landing_only']).default('physical_qr'),
    statement_token: z.string().min(8).optional(),
    custom_landing_copy_it: z.string().optional(),
    custom_landing_copy_en: z.string().optional(),
  }),
});

const sourceEntry = z.object({
  type: z.enum(['book', 'academic', 'archive', 'newspaper', 'documentary', 'website']),
  author: z.string().optional(),
  title: z.string(),
  publisher: z.string().optional(),
  year: z.number().int().optional(),
  url: z.url().optional(),
});

const sources = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/sources' }),
  schema: z.object({
    slug: z.string(),
    guide_title_it: z.string(),
    guide_title_en: z.string(),
    guide_title_de: z.string().optional(),
    research_note_it: z.string().optional(),
    research_note_en: z.string().optional(),
    research_note_de: z.string().optional(),
    last_review: z.date(),
    chapters: z.array(
      z.object({
        title_it: z.string(),
        title_en: z.string().optional(),
        title_de: z.string().optional(),
        framing_it: z.string().optional(),
        framing_en: z.string().optional(),
        framing_de: z.string().optional(),
        facts: z.array(
          z.object({
            claim_it: z.string(),
            claim_en: z.string().optional(),
            claim_de: z.string().optional(),
            sources: z.array(sourceEntry).min(1),
          }),
        ).min(1),
      }),
    ).min(1),
  }),
});

// ─── Blog ────────────────────────────────────────────────────────────────────
// Un file MDX per lingua per ogni articolo (es. storia-bari-vecchia.mdx,
// history-old-bari.mdx). Il campo `lang` separa le tre versioni linguistiche.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    // Lingua di questo file
    lang: z.enum(['it', 'en', 'de']).default('it'),
    // Slug URL per questa lingua (es. "storia-bari-vecchia")
    slug: z.string(),
    // Slug delle altre versioni — usati per hreflang reciproci
    slug_it: z.string(),
    slug_en: z.string(),
    slug_de: z.string().optional(),
    // Contenuto localizzato
    title: z.string(),
    description: z.string().max(160),
    // Immagine copertina (file separato, mai base64)
    cover: z.string(),               // es. /images/blog/storia-bari-vecchia.webp
    cover_alt: z.string(),
    cover_width: z.number().int().positive(),
    cover_height: z.number().int().positive(),
    // Date
    published_at: z.date(),
    updated_at: z.date().optional(),
    // Autore e trasparenza editoriale
    author_name: z.string().optional(),
    author_role: z.string().optional(),
    author_photo: z.string().optional(),
    author_bio: z.string().optional(),
    author_url: z.string().optional(),
    editorial_note: z.string().optional(),
    // Categoria per eyebrow (es. "Approfondimento storico", "Itinerario", "Guida pratica", "Cibo e tradizioni")
    category: z.string().default('Approfondimento storico'),
    // Guida audio collegata (per il box CTA)
    guide_slug: z.string(),          // es. "bari-vecchia"
    guide_title: z.string(),         // es. "Bari Vecchia — Dentro la Città"
    guide_product: z.enum(['single', 'bari-completa', 'valle-completa', 'gargano-completa', 'tris', 'crociera']).default('single'),
    guide_price_label: z.string().default('€4,99'),
    // Articoli correlati (slug blog nella stessa lingua)
    related: z.array(z.string()).max(3).default([]),
    // Breadcrumb zona
    zone_label: z.string(),          // es. "Bari"
    zone_href: z.string(),           // es. "/bari" (senza prefisso lingua — aggiunto dalla page)
    // Stato
    status: z.enum(['published', 'draft']).default('published'),
  }),
});

// ─── Masserie ────────────────────────────────────────────────────────────────
// Un racconto breve (≈3 min) per masseria, gratis per tutti, scritto da fonti
// pubbliche. Il corpo del file è la trascrizione di quello che dice la voce.
// Solo italiano finché la masseria non accetta la cornicetta.
const masserie = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/masserie' }),
  schema: z.object({
    slug: z.string(),
    name: z.string(),                 // es. "Masseria Parco della Grava"
    place: z.string(),                // es. "Pezze di Greco, Fasano"
    title_it: z.string(),             // titolo del racconto
    audio_it: z.string(),             // es. /audio/masserie/parco-della-grava-it.mp3
    duration_seconds: z.number().int().positive(),   // da ffprobe, mai stimato
    // Altre lingue: arrivano dopo il sì della masseria (D2, 18/10/2026). Mai promettere
    // una lingua senza il suo file audio: il selettore compare solo se il campo c'è.
    audio_en: z.string().optional(),
    duration_en_seconds: z.number().int().positive().optional(),
    audio_de: z.string().optional(),
    duration_de_seconds: z.number().int().positive().optional(),
    // «breve» = 3 minuti in seconda persona (voce Corrado); «lungo» = i racconti da
    // 10-15 minuti scritti per le strutture (terza persona). La scheda dichiara durata e voce.
    format: z.enum(['breve', 'lungo']).default('breve'),
    voice: z.string().default('Corrado'),            // nome della voce sintetica dichiarata
    website_url: z.url().optional(),  // si riempie al sì allo scambio di link
    zone_label: z.string(),           // es. "Valle d'Itria"
    zone_href: z.string(),            // es. "/valle-d-itria/"
    description: z.string().max(160),
    sources: z.array(sourceEntry).min(1),
    published_at: z.date(),
    status: z.enum(['published', 'draft']).default('published'),
  }),
});

export const collections = { guides, partners, sources, blog, masserie };

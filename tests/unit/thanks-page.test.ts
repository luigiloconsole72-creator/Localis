import type { CollectionEntry } from 'astro:content';
import { describe, expect, it } from 'vitest';
import { buildThanksPageModel } from '../../src/lib/thanks-page';

type GuideEntry = CollectionEntry<'guides'>;

function makeGuideEntry(
  slug: string,
  overrides: Partial<GuideEntry['data']> = {},
): GuideEntry {
  return {
    id: `${slug}.mdx`,
    body: '',
    collection: 'guides',
    data: {
      slug,
      city: 'bari',
      title_it: `Titolo ${slug}`,
      title_en: `Title ${slug}`,
      title_de: `Titel ${slug}`,
      subtitle_it: `Sottotitolo ${slug}`,
      subtitle_en: `Subtitle ${slug}`,
      subtitle_de: `Untertitel ${slug}`,
      duration_seconds: 1800,
      duration_seconds_en: 1820,
      duration_seconds_de: 1860,
      cover: `/covers/${slug}.jpg`,
      audio_full_key_it: `${slug}-it.mp3`,
      audio_full_key_en: `${slug}-en.mp3`,
      audio_full_key_de: `${slug}-de.mp3`,
      chapters: [
        {
          title_it: 'Capitolo 1',
          title_en: 'Chapter 1',
          title_de: 'Kapitel 1',
          start_seconds: 0,
          start_seconds_en: 0,
          start_seconds_de: 0,
        },
      ],
      price_cents: 499,
      status: 'live',
      published_at: new Date('2026-01-01T00:00:00.000Z'),
      seo: {
        description_it: `Descrizione ${slug}`,
        description_en: `Description ${slug}`,
        description_de: `Beschreibung ${slug}`,
      },
      ...overrides,
    },
    rendered: undefined,
    filePath: `src/content/guides/${slug}.mdx`,
  };
}

describe('buildThanksPageModel', () => {
  it('builds ordered paid-session guide cards in German with deep links', () => {
    const token = 'tok_paid_de';
    const model = buildThanksPageModel({
      lang: 'de',
      token,
      buyerEmail: 'kunde@example.com',
      guideSlugs: ['porto-bari', 'bari-vecchia'],
      matchedGuides: [
        makeGuideEntry('bari-vecchia', {
          title_de: 'Bari Vecchia auf Deutsch',
          subtitle_de: 'Altstadtgeschichten',
          duration_seconds_de: 2400,
        }),
        makeGuideEntry('porto-bari', {
          title_de: 'Hafen von Bari',
          subtitle_de: 'Geschichten am Wasser',
          duration_seconds_de: 2100,
        }),
      ],
    });

    expect(model).toEqual({
      state: 'ready',
      pageTitle: 'Deine Guides sind bereit.',
      primaryMessage: 'Du kannst direkt von hier aus mit dem Hören beginnen.',
      emailMessage:
        'Wir haben dir den Zugangslink auch an kunde@example.com geschickt, damit du später alles wiederfindest.',
      cardCta: 'Jetzt anhören',
      cards: [
        {
          slug: 'porto-bari',
          title: 'Hafen von Bari',
          subtitle: 'Geschichten am Wasser',
          duration: '35 min',
          cover: '/covers/porto-bari.jpg',
          ctaHref: `/access/${token}?lang=de#porto-bari`,
        },
        {
          slug: 'bari-vecchia',
          title: 'Bari Vecchia auf Deutsch',
          subtitle: 'Altstadtgeschichten',
          duration: '40 min',
          cover: '/covers/bari-vecchia.jpg',
          ctaHref: `/access/${token}?lang=de#bari-vecchia`,
        },
      ],
    });
  });

  it('returns the fallback state when no paid guides are available', () => {
    const model = buildThanksPageModel({
      lang: 'de',
      token: null,
      buyerEmail: null,
      guideSlugs: ['missing-guide'],
      matchedGuides: [],
    });

    expect(model).toEqual({
      state: 'fallback',
      pageTitle: 'Danke.',
      primaryMessage: 'Wir haben deine Zahlung erhalten, aber konnten gerade keine Guides laden.',
      emailMessage: 'Wir senden dir den Zugangslink gleich per E-Mail. Bitte prüfe auch den Spam-Ordner.',
      cardCta: 'Jetzt anhören',
      cards: [],
    });
  });
});

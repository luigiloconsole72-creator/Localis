import { describe, it, expect } from 'vitest';
import {
  localizedHref,
  stripLocalePrefix,
  alternateLangUrl,
  getPreferredLangFromHeader,
  isPublicHtmlPath,
  withLangQuery,
} from '../../src/lib/i18n';
import { t } from '../../src/lib/i18n-strings';

describe('i18n helpers', () => {
  describe('localizedHref', () => {
    it('returns path unchanged for Italian', () => {
      expect(localizedHref('/guide/bari-vecchia', 'it')).toBe('/guide/bari-vecchia');
    });

    it('prefixes path with /en for English', () => {
      expect(localizedHref('/guide/bari-vecchia', 'en')).toBe('/en/guide/bari-vecchia');
    });

    it('handles paths without leading slash', () => {
      expect(localizedHref('guide/porto-bari', 'en')).toBe('/en/guide/porto-bari');
    });

    it('handles root path', () => {
      expect(localizedHref('/', 'it')).toBe('/');
      expect(localizedHref('/', 'en')).toBe('/en/');
    });
  });

  describe('stripLocalePrefix', () => {
    it('strips /en prefix', () => {
      expect(stripLocalePrefix('/en/guide/bari-vecchia')).toBe('/guide/bari-vecchia');
    });

    it('leaves Italian paths unchanged', () => {
      expect(stripLocalePrefix('/guide/porto-bari')).toBe('/guide/porto-bari');
    });

    it('handles bare /en correctly', () => {
      expect(stripLocalePrefix('/en')).toBe('/');
    });
  });

  describe('alternateLangUrl', () => {
    it('flips IT path to EN equivalent', () => {
      expect(alternateLangUrl('/guide/bari-vecchia', 'it')).toBe('/en/guide/bari-vecchia');
    });

    it('flips EN path to IT equivalent', () => {
      expect(alternateLangUrl('/en/guide/bari-vecchia', 'en')).toBe('/guide/bari-vecchia');
    });
  });

  describe('language routing helpers', () => {
    it('detects excluded technical and asset paths', () => {
      expect(isPublicHtmlPath('/api/checkout')).toBe(false);
      expect(isPublicHtmlPath('/_astro/chunk.js')).toBe(false);
      expect(isPublicHtmlPath('/access/token')).toBe(false);
      expect(isPublicHtmlPath('/favicon.svg')).toBe(false);
      expect(isPublicHtmlPath('/guide/bari-vecchia')).toBe(true);
    });

    // Regressione 21/09: /thanks e' l'unica pagina d'acquisto in SSR, quindi il
    // redirect lingua la spediva su /de/thanks — rotta che non esiste. Ogni
    // compratore tedesco o inglese vedeva un 404 appena pagato.
    it('keeps SSR pages without a localized twin out of language routing', () => {
      expect(isPublicHtmlPath('/thanks')).toBe(false);
      expect(isPublicHtmlPath('/thanks/')).toBe(false);
      expect(isPublicHtmlPath('/admin/referral')).toBe(false);
      expect(isPublicHtmlPath('/partner/masseria-dirupo/statement')).toBe(false);
    });

    it('picks supported language from Accept-Language header', () => {
      expect(getPreferredLangFromHeader('de-DE,de;q=0.9,en;q=0.8,it;q=0.7')).toBe('de');
      expect(getPreferredLangFromHeader('en-GB,en;q=0.9,it;q=0.8')).toBe('en');
      expect(getPreferredLangFromHeader('fr-FR,fr;q=0.9')).toBe('it');
      expect(getPreferredLangFromHeader(null)).toBe('it');
    });

    it('adds explicit lang query to manual switch links', () => {
      expect(withLangQuery('/en/guide/bari-vecchia', 'en')).toBe('/en/guide/bari-vecchia?lang=en');
      expect(withLangQuery('/guide/bari-vecchia?p=hotel-excelsior-bari', 'de')).toBe('/guide/bari-vecchia?p=hotel-excelsior-bari&lang=de');
    });
  });
});

describe('translation lookup t()', () => {
  it('returns Italian string for IT lang', () => {
    expect(t('site.tagline', 'it')).toBe('Audioguide narrative · Puglia');
  });

  it('returns English string for EN lang', () => {
    expect(t('site.tagline', 'en')).toBe('Narrative audio guides · Puglia');
  });
});

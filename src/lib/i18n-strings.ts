import type { Lang } from './i18n';

/**
 * UI strings shared across components. Page-specific copy lives in MDX content.
 * Keep keys flat for simplicity; add nesting only if strings grow >50.
 */
export const STRINGS = {
  it: {
    'site.name': 'Localis',
    'nav.home': 'Start',
    'nav.guide': 'Guide',
    'nav.partner': 'Diventa partner',
    'nav.about': 'Chi siamo',
    'lang.switch_to_en': 'EN',
    'lang.switch_to_it': 'IT',
    'lang.switch_to_de': 'DE',
    'lang.current_it': 'Italiano',
    'lang.current_en': 'English',
    'lang.current_de': 'Deutsch',
    'footer.copyright': '© Localis · Puglia',
    'footer.terms': 'Termini',
    'footer.privacy': 'Privacy',
    'a11y.skip_to_content': 'Salta al contenuto principale',
  },
  en: {
    'site.name': 'Localis',
    'nav.home': 'Home',
    'nav.guide': 'Guides',
    'nav.partner': 'Become a partner',
    'nav.about': 'About',
    'lang.switch_to_en': 'EN',
    'lang.switch_to_it': 'IT',
    'lang.switch_to_de': 'DE',
    'lang.current_it': 'Italiano',
    'lang.current_en': 'English',
    'lang.current_de': 'Deutsch',
    'footer.copyright': '© Localis · Puglia',
    'footer.terms': 'Terms',
    'footer.privacy': 'Privacy',
    'a11y.skip_to_content': 'Skip to main content',
  },
  de: {
    'site.name': 'Localis',
    'nav.home': 'Home',
    'nav.guide': 'Guides',
    'nav.partner': 'Partner werden',
    'nav.about': 'Über uns',
    'lang.switch_to_en': 'EN',
    'lang.switch_to_it': 'IT',
    'lang.switch_to_de': 'DE',
    'lang.current_it': 'Italiano',
    'lang.current_en': 'English',
    'lang.current_de': 'Deutsch',
    'footer.copyright': '© Localis · Apulien',
    'footer.terms': 'AGB',
    'footer.privacy': 'Datenschutz',
    'a11y.skip_to_content': 'Zum Inhalt springen',
  },
} as const;

export type StringKey = keyof typeof STRINGS['it'];

/**
 * Lookup a translation. Falls back to Italian if key missing in target lang.
 */
export function t(key: StringKey, lang: Lang): string {
  const langStrings = STRINGS[lang as keyof typeof STRINGS];
  return (langStrings as Record<string, string>)[key] ?? STRINGS.it[key];
}

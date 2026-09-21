import type { Lang } from './i18n';

/**
 * Format duration in seconds to "M min" or "MM:SS" depending on context.
 */
export function formatDuration(seconds: number, format: 'short' | 'long' = 'short'): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);

  if (format === 'long') {
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return `${m} min`;
}

/**
 * Prezzo per lingua. Separatore e posizione del simbolo non sono un dettaglio
 * estetico: in tedesco "€4.99" si legge come separatore di migliaia. Il resto
 * del copy IT/DE usa gia' la notazione locale ("9,95 €", "€2,98") e prima questa
 * funzione la contraddiceva dentro la stessa card.
 *
 *   it → €4,99   ·   en → €4.99   ·   de → 4,99 €
 */
export function formatPrice(cents: number, lang: Lang = 'it'): string {
  const amount = (cents / 100).toFixed(2).replace('.', lang === 'en' ? '.' : ',');
  return lang === 'de' ? `${amount} €` : `€${amount}`;
}

/**
 * Mask an email for logging so PII never lands in server logs.
 * "buyer@example.com" -> "b***@example.com"
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const first = email[0];
  const domain = email.slice(at);
  return `${first}***${domain}`;
}

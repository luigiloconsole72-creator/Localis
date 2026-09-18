// Usata dai due contatori consenso-indipendenti: le scansioni QR (middleware)
// e le pagine viste (/api/hit). Sta qui per non averne due copie che divergono.
export const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|monitor|curl|wget|python-requests|axios|node-fetch|okhttp|go-http/i;

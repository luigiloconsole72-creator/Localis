// Raccoglie i dati per il digest giornaliero e li stampa in JSON su stdout.
// Output: { date, ga4, commits, recontact }
//
// L'UNICO consumatore e' C:\Dev\gallery-outreach\daily_digest.py, lanciato dal
// Task Scheduler ("Localis Daily Digest", 08:00) via run-daily-digest.bat, che
// aggiunge i conteggi del DB outreach e manda la mail con Resend. Nel 2026-08
// era nato un secondo digest su GitHub Actions: non ha mai funzionato (secret
// mai impostati) ed e' stato rimosso il 2026-09-18. Se serve togliere la
// dipendenza dal PC acceso, va portato via anche il DB outreach, non solo lo
// script.

import { readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runReport } from './ga4-shared.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCALIS = join(HERE, '..');
const GALLERY = 'C:/Dev/gallery-outreach';
const PARTNERS_DIR = join(LOCALIS, 'src', 'content', 'partners');
const GRACE = 12;
const PHYSICAL = new Set(['hotel', 'bb', 'bar', 'restaurant', 'ristorante', 'shop', 'infopoint', 'cafe']);

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = new Date();
const yest = new Date(today); yest.setDate(today.getDate() - 1);

function num(r, i = 0) { return Number(r?.metricValues?.[i]?.value || 0); }
function rows(d) { return d.rows || []; }

// --- GA4: totali di ieri ---
const yRange = [{ startDate: '1daysAgo', endDate: '1daysAgo' }];
const tot = await runReport({ dateRanges: yRange, metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }] });
const totRow = rows(tot)[0];

const evs = await runReport({
  dateRanges: yRange,
  dimensions: [{ name: 'eventName' }],
  metrics: [{ name: 'eventCount' }],
  dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['qr_scan', 'audio_preview_played', 'preview_played', 'checkout_started', 'begin_checkout', 'purchase', 'guide_audio_started', 'form_submit'] } } },
});
const events = {};
for (const r of rows(evs)) events[r.dimensionValues[0].value] = num(r);

const scanPart = await runReport({
  dateRanges: yRange,
  dimensions: [{ name: 'customEvent:partner_id' }],
  metrics: [{ name: 'eventCount' }],
  dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'qr_scan' } } },
});
const scansByPartner = rows(scanPart).map((r) => ({ partner: r.dimensionValues[0].value || '(n/d)', scans: num(r) }));

// Provenienza degli utenti di IERI per canale (a basso volume ≈ per persona).
const provQ = await runReport({
  dateRanges: yRange,
  dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionSource' }],
  metrics: [{ name: 'totalUsers' }],
  orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
  limit: 10,
});
const provenance = rows(provQ).map((r) => ({
  channel: r.dimensionValues[0].value || '(n/d)',
  source: r.dimensionValues[1].value || '',
  users: num(r),
}));

// --- Traffico sito ultimi 7 giorni (non partner): finestra mobile ---
// "Ieri" col sito a ~0-2 visite/giorno è quasi sempre vuoto: l'organico
// si vede solo su una finestra più larga. Questa sezione c'è sempre.
const wRange = [{ startDate: '7daysAgo', endDate: 'today' }];

const tot7 = await runReport({ dateRanges: wRange, metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }] });
const tot7Row = rows(tot7)[0];

const pages7 = await runReport({
  dateRanges: wRange,
  dimensions: [{ name: 'pagePath' }],
  metrics: [{ name: 'screenPageViews' }],
  orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
  limit: 20,
});
// Esclude le landing partner (/p/, /en/p/, /de/p/): sono traffico da QR, hanno
// la loro sezione (funnel + scansioni). Qui contano solo le pagine "sito".
const isPartnerLanding = (path) => /^\/(?:en\/|de\/)?p\//.test(path);
const topPages = rows(pages7)
  .map((r) => ({ path: r.dimensionValues[0].value || '(n/d)', views: num(r) }))
  .filter((p) => !isPartnerLanding(p.path))
  .slice(0, 5);

const chan7 = await runReport({
  dateRanges: wRange,
  dimensions: [{ name: 'sessionDefaultChannelGroup' }],
  metrics: [{ name: 'sessions' }],
  orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  limit: 8,
});
const channels = rows(chan7).map((r) => ({ channel: r.dimensionValues[0].value || '(n/d)', sessions: num(r) }));

const site7d = {
  sessions: num(tot7Row, 0),
  users: num(tot7Row, 1),
  pageviews: num(tot7Row, 2),
  channels,
  topPages,
};

// --- Funnel 7gg: scan -> anteprima -> checkout -> acquisto ---
const funnelEv = await runReport({
  dateRanges: wRange,
  dimensions: [{ name: 'eventName' }],
  metrics: [{ name: 'eventCount' }],
  dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['qr_scan', 'audio_preview_played', 'begin_checkout', 'purchase'] } } },
});
const fc = {};
for (const r of rows(funnelEv)) fc[r.dimensionValues[0].value] = num(r);
const funnel7d = {
  scan: fc.qr_scan || 0,
  preview: fc.audio_preview_played || 0,
  checkout: fc.begin_checkout || 0,
  purchase: fc.purchase || 0,
};

// --- Scansioni per partner: SERVER (vere, consenso-indipendenti) vs GA4 (consentite) ---
// GA4 qr_scan scatta solo dopo consenso cookie; il contatore server vede tutto.
// Il gap = scansioni perse dal gate del consenso (o QR fermo se anche server=0).
const ga4ScanQ = await runReport({
  dateRanges: wRange,
  dimensions: [{ name: 'customEvent:partner_id' }],
  metrics: [{ name: 'eventCount' }],
  dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'qr_scan' } } },
});
const ga4ScanMap = {};
for (const r of rows(ga4ScanQ)) { const p = r.dimensionValues[0]?.value; if (p && p !== '(not set)') ga4ScanMap[p] = num(r); }
// Una sola chiamata al contatore server (21gg): serve a scanCompare, alle
// pagine viste consenso-indipendenti e al confronto con la settimana prima.
let srv = null;
try {
  const token = process.env.ADMIN_TOKEN || '';
  if (token) {
    const res = await fetch(`https://localis.guide/api/scan-counts?token=${encodeURIComponent(token)}&days=21`);
    if (res.ok) srv = await res.json();
  }
} catch { /* endpoint non raggiungibile: mostra solo GA4 */ }

// Finestre di date allineate a GA4: '7daysAgo'..'today' = 8 giorni inclusi.
const dayBack = (n) => { const d = new Date(today); d.setDate(today.getDate() - n); return ymd(d); };
const win7 = Array.from({ length: 8 }, (_, i) => dayBack(i));
const winPrev7 = Array.from({ length: 8 }, (_, i) => dayBack(i + 8));

const srvScanMap = {};
for (const day of win7) {
  for (const [k, v] of Object.entries(srv?.byDay?.[day] || {})) {
    if (!k.startsWith('q:')) srvScanMap[k] = (srvScanMap[k] || 0) + v;
  }
}

// Pagine viste lato server: esistono solo dai giorni in cui l'edge function
// conta. Se non c'è nessun giorno con dati, la sezione non si mostra affatto
// (meglio niente che uno zero che sembra un crollo).
const viewsByDay = srv?.views?.byDay || {};
const viewsAvailable = Object.keys(viewsByDay).length > 0;
const sumViews = (days) => days.reduce((a, d) => a + (viewsByDay[d] || 0), 0);
let zeroStreak = 0;
if (viewsAvailable) {
  const known = Object.keys(viewsByDay).sort();
  const oldest = known[0];
  for (let i = 1; i <= 21; i += 1) {          // parte da ieri, non da oggi
    const d = dayBack(i);
    if (d < oldest || (viewsByDay[d] || 0) > 0) break;
    zeroStreak += 1;
  }
}
const serverViews = viewsAvailable
  ? {
      yesterday: viewsByDay[ymd(yest)] || 0,
      last7d: sumViews(win7),
      prev7d: sumViews(winPrev7),
      zeroStreak,
      topPages21d: Object.entries(srv?.views?.byPath || {})
        .filter(([p]) => !isPartnerLanding(p))
        .slice(0, 5)
        .map(([path, views]) => ({ path, views })),
    }
  : null;

// GA4 settimana precedente, per il confronto (non per il valore assoluto).
const prevRange = [{ startDate: '15daysAgo', endDate: '8daysAgo' }];
const totPrev = await runReport({ dateRanges: prevRange, metrics: [{ name: 'sessions' }, { name: 'totalUsers' }] });
const totPrevRow = rows(totPrev)[0];
const prev7d = { sessions: num(totPrevRow, 0), users: num(totPrevRow, 1) };
const scanCompare = [...new Set([...Object.keys(srvScanMap), ...Object.keys(ga4ScanMap)])]
  .map((p) => ({ partner: p, server: srvScanMap[p] || 0, ga4: ga4ScanMap[p] || 0 }))
  .filter((x) => x.server > 0 || x.ga4 > 0)
  .sort((a, b) => (b.server + b.ga4) - (a.server + a.ga4));

// --- Git: commit di ieri nei due repo ---
function commitsSince(repo) {
  try {
    const out = execSync(
      `git -C "${repo}" log --since="${ymd(yest)} 00:00:00" --until="${ymd(today)} 00:00:00" --pretty=format:%s`,
      { encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}

// --- Partner da ricontattare (finestra 14gg, stessa logica del check) ---
function field(src, name) { const m = src.match(new RegExp(`^${name}:\\s*"?([^"\\n]+)"?\\s*$`, 'm')); return m ? m[1].trim() : null; }
let deployment = {};
try { deployment = JSON.parse(readFileSync(join(HERE, 'partner-deployment.json'), 'utf8')); } catch { /* ok */ }

const scan14 = await runReport({
  dateRanges: [{ startDate: '14daysAgo', endDate: 'today' }],
  dimensions: [{ name: 'customEvent:partner_id' }],
  metrics: [{ name: 'eventCount' }],
  dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'qr_scan' } } },
});
const scans14 = new Map();
for (const r of rows(scan14)) scans14.set(r.dimensionValues[0].value, num(r));

const ageDays = (d) => Math.floor((today - new Date(d)) / 86400000);
const recontact = [];
for (const file of readdirSync(PARTNERS_DIR).filter((f) => f.endsWith('.mdx'))) {
  const src = readFileSync(join(PARTNERS_DIR, file), 'utf8');
  if (field(src, 'status') !== 'active') continue;
  const slug = field(src, 'slug') || file.replace(/\.mdx$/, '');
  const dep = deployment[slug] || {};
  const channel = dep.channel || (PHYSICAL.has(field(src, 'type') || '') ? 'physical' : 'other');
  if (channel !== 'physical') continue;
  let qrDate = null, notDelivered = false;
  if (Object.prototype.hasOwnProperty.call(dep, 'qr_activated_at')) {
    if (dep.qr_activated_at === null) notDelivered = true; else qrDate = dep.qr_activated_at;
  } else qrDate = field(src, 'created_at');
  if (notDelivered || !qrDate) continue;
  if (ageDays(qrDate) < GRACE) continue;
  if ((scans14.get(slug) || 0) === 0) recontact.push({ name: field(src, 'display_name') || slug, slug, since: qrDate, age: ageDays(qrDate) });
}

console.log(JSON.stringify({
  date: ymd(yest),
  ga4: {
    sessions: num(totRow, 0), users: num(totRow, 1), pageviews: num(totRow, 2),
    events, scansByPartner, provenance, site7d, prev7d, funnel7d, scanCompare,
  },
  // Numeri veri, indipendenti dal consenso cookie. null = endpoint irraggiungibile
  // o edge function non ancora attiva (in quel caso il digest resta GA4-only).
  server: { reachable: srv !== null, views: serverViews },
  commits: { localis: commitsSince(LOCALIS), gallery: commitsSince(GALLERY) },
  recontact,
}, null, 2));

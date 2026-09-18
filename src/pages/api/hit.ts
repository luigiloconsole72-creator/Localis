// Contatore pagine viste indipendente dal consenso cookie.
//
// Su Netlify lo faceva un'edge function davanti a ogni richiesta. Su Vercel le
// pagine prerenderizzate (74 su 80) le serve la CDN senza toccare nessuna
// funzione, quindi il colpo lo manda il browser da Layout.astro appena la
// pagina e' caricata. Non e' il consenso a decidere chi viene contato: qui non
// si legge nessun cookie, nessun IP, nessun identificatore, solo due contatori
// aggregati per giorno. GA4 e PostHog invece partono dopo l'accettazione e
// vedono una frazione del traffico (misurato: 5 scansioni su 34).
import type { APIRoute } from 'astro';
import { BOT } from '../../lib/bots';
import { kvHIncrBy } from '../../lib/kv';

export const prerender = false;

// Il percorso arriva dal browser e finisce come campo di un hash Redis: niente
// query, niente host, lunghezza limitata.
const PATH = /^\/[a-z0-9\-/_.]{0,119}$/;

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const path = (url.searchParams.get('p') || '').toLowerCase();
    const ua = request.headers.get('user-agent') || '';
    if (PATH.test(path) && ua && !BOT.test(ua)) {
      const day = new Date().toISOString().slice(0, 10);
      await Promise.all([
        kvHIncrBy('scan-counts', day, `v:${path}`),
        kvHIncrBy('scan-counts', day, 'v:__all'),
      ]);
    }
  } catch {
    /* un contatore che fallisce non deve disturbare la pagina */
  }
  // Sempre 204: sendBeacon non legge la risposta e un errore di conteggio non
  // deve finire nella console di chi visita il sito.
  return new Response(null, { status: 204 });
};

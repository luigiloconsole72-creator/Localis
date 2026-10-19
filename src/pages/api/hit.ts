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
// Le storie delle masserie: per loro si tiene anche l'ora (UTC), perche' dopo
// la mail alla struttura conta sapere QUANDO la pagina viene aperta e la voce
// fatta partire, non solo quante volte.
const MASSERIA = /^\/masserie\/[a-z0-9-]+\/$/;

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const path = (url.searchParams.get('p') || '').toLowerCase();
    const ua = request.headers.get('user-agent') || '';
    // e=play: la voce e' partita (lo manda HeroAudioSample). Senza e: pagina vista.
    const play = url.searchParams.get('e') === 'play';
    if (PATH.test(path) && ua && !BOT.test(ua)) {
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const prefix = play ? 'a' : 'v';
      const fields = [`${prefix}:${path}`];
      if (!play) fields.push('v:__all');
      if (MASSERIA.test(path)) fields.push(`${prefix}h:${path}@${now.toISOString().slice(11, 13)}`);
      await Promise.all(fields.map((f) => kvHIncrBy('scan-counts', day, f)));
    }
  } catch {
    /* un contatore che fallisce non deve disturbare la pagina */
  }
  // Sempre 204: sendBeacon non legge la risposta e un errore di conteggio non
  // deve finire nella console di chi visita il sito.
  return new Response(null, { status: 204 });
};

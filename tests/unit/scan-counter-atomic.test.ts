import type { APIContext, MiddlewareNext } from 'astro';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetKvMemory, kvHGetAll, kvHIncrBy } from '../../src/lib/kv';
import { onRequest } from '../../src/middleware';
import { POST } from '../../src/pages/api/hit';

// Il contatore scansioni viveva su Netlify Blobs, che non ha incremento
// atomico: due richieste contemporanee leggevano lo stesso valore e la
// seconda sovrascriveva la prima, perdendo la scansione. Si rimediava con
// scritture condizionali su ETag e un ciclo di tentativi.
//
// Con Redis l'incremento e' atomico e quel ciclo non serve piu'. Questo test
// resta a guardia della proprieta' che conta — nessun conteggio perso —
// perche' e' facile tornare per sbaglio a un leggi-modifica-riscrivi.
describe('contatore scansioni', () => {
  beforeEach(() => _resetKvMemory());

  it('non perde conteggi con incrementi concorrenti', async () => {
    const N = 50;
    await Promise.all(Array.from({ length: N }, () => kvHIncrBy('scan-counts', '2026-09-06', 'tenace-petrol-cagnano')));

    const rec = await kvHGetAll('scan-counts', '2026-09-06');
    expect(rec['tenace-petrol-cagnano']).toBe(N);
  });

  it('tiene i partner separati nello stesso giorno', async () => {
    await kvHIncrBy('scan-counts', '2026-09-06', 'giardino-lido-sole');
    await kvHIncrBy('scan-counts', '2026-09-06', 'giardino-lido-sole');
    await kvHIncrBy('scan-counts', '2026-09-06', 'london-bar');

    expect(await kvHGetAll('scan-counts', '2026-09-06')).toEqual({
      'giardino-lido-sole': 2,
      'london-bar': 1,
    });
  });

});

// Questi test esistono perche' il contatore e' rimasto morto 12 giorni senza
// che niente lo segnalasse: la migrazione a Vercel aveva lasciato la funzione
// di conteggio definita ma mai chiamata, e il test di allora si limitava a
// cercare la stringa "kvHIncrBy" nel sorgente — passava lo stesso. Qui il
// middleware viene eseguito davvero.
describe('il middleware conta le visite', () => {
  const today = new Date().toISOString().slice(0, 10);
  const browser = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

  beforeEach(() => _resetKvMemory());

  function context(path: string, { ua = browser, acceptLanguage = 'it-IT,it;q=0.9' } = {}) {
    const url = new URL(`https://localis.guide${path}`);
    const jar = new Map<string, string>();
    return {
      url,
      request: new Request(url, { headers: { 'user-agent': ua, 'accept-language': acceptLanguage } }),
      cookies: {
        set: (name: string, value: string) => jar.set(name, value),
        get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
      },
      redirect: (to: string, status = 302) => new Response(null, { status, headers: { location: to } }),
    } as unknown as APIContext;
  }

  const servePage = (() =>
    new Response('<html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })) as unknown as MiddlewareNext;

  it('conta la scansione del partner', async () => {
    await onRequest(context('/p/london-bar/'), servePage);

    expect(await kvHGetAll('scan-counts', today)).toEqual({ 'london-bar': 1 });
  });

  it('conta il codice QR neutro sotto la chiave q:', async () => {
    await onRequest(context('/q/AR9PL4/'), servePage);

    const rec = await kvHGetAll('scan-counts', today);
    expect(rec['q:ar9pl4']).toBe(1);
  });

  it('non conta i bot', async () => {
    await onRequest(context('/guide/bari-vecchia/', { ua: 'Googlebot/2.1 (+http://www.google.com/bot.html)' }), servePage);

    expect(await kvHGetAll('scan-counts', today)).toEqual({});
  });

  it('non conta un redirect: la visita e la richiesta che lo segue', async () => {
    const res = await onRequest(context('/', { acceptLanguage: 'de-DE,de;q=0.9' }), servePage);

    expect((res as Response).status).toBe(302);
    expect(await kvHGetAll('scan-counts', today)).toEqual({});
  });
});

// Le pagine viste non passano dal middleware: su Vercel le pagine
// prerenderizzate le serve la CDN. Le conta /api/hit, chiamato dal browser.
describe('/api/hit conta le pagine viste', () => {
  const today = new Date().toISOString().slice(0, 10);
  const browser = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

  beforeEach(() => _resetKvMemory());

  const hit = (path: string, ua = browser) => {
    const url = new URL(`https://localis.guide/api/hit?p=${encodeURIComponent(path)}`);
    return POST({
      url,
      request: new Request(url, { method: 'POST', headers: { 'user-agent': ua } }),
    } as unknown as APIContext);
  };

  it('conta la pagina e il totale del giorno', async () => {
    await hit('/guide/bari-vecchia/');

    expect(await kvHGetAll('scan-counts', today)).toEqual({
      'v:/guide/bari-vecchia/': 1,
      'v:__all': 1,
    });
  });

  it('ignora un percorso che non e un percorso del sito', async () => {
    await hit('https://altrosito.example/pagina');
    await hit(`/${'x'.repeat(200)}`);

    expect(await kvHGetAll('scan-counts', today)).toEqual({});
  });

  it('non conta i bot', async () => {
    await hit('/guide/', 'Googlebot/2.1 (+http://www.google.com/bot.html)');

    expect(await kvHGetAll('scan-counts', today)).toEqual({});
  });
});

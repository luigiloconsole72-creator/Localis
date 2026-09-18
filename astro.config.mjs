// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  site: 'https://localis.guide',
  output: 'server',
  adapter: vercel({
    // Inietta lo script di Vercel Web Analytics, servito da /_vercel/insights/
    // sullo stesso dominio: la CSP lo copre gia' con 'self'. Va acceso anche
    // dal pannello Vercel (scheda Analytics), altrimenti lo script parte ma
    // non ha dove scrivere.
    webAnalytics: { enabled: true },

    // Il middleware come edge function separata. Serve soprattutto a NON farlo
    // girare durante il build: in modalita' 'classic' Astro lo esegue anche al
    // momento di prerenderizzare le pagine statiche, e qui dentro c'e' un
    // contatore che scrive su Redis.
    //
    // ATTENZIONE a cosa NON fa: su Vercel le pagine prerenderizzate (74 su 80)
    // le serve la CDN prima di ogni funzione (`handle: filesystem` nel build
    // output), quindi il middleware le vede comunque solo se sono SSR. Il
    // conteggio consenso-indipendente vale per /p/{slug}; su Netlify copriva
    // tutto il sito perche' l'edge function girava prima dei file statici.
    middlewareMode: 'edge',

    // L'audio completo delle guide vive su R2, non nel bundle: escluderlo
    // tiene la funzione leggera (e impedisce che finisca servito per sbaglio).
    excludeFiles: [
      './public/audio/guides/**',
      './public/video/**',
      './chunks/**',
      './scripts/*.mp3',
    ],
  }),

  // La guida il-meglio-di-bari è stata sostituita da bari-tavola (2026-06-11);
  // i vecchi URL restano nell'indice Google e nei link condivisi.
  redirects: {
    '/guide/il-meglio-di-bari': '/guide/bari-tavola',
    '/en/guide/il-meglio-di-bari': '/en/guide/bari-tavola',
    '/de/guide/il-meglio-di-bari': '/de/guide/bari-tavola',
  },

  vite: {
    plugins: [tailwindcss()],
  },

  i18n: {
    defaultLocale: 'it',
    locales: ['it', 'en', 'de'],
    routing: {
      prefixDefaultLocale: false,
    },
  },

  integrations: [
    mdx(),
  ],
});

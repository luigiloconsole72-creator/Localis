// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  site: 'https://localis.guide',
  output: 'server',

  // La dev toolbar inietta DOM proprio (pannelli, heading, bottoni) che finisce
  // sotto i selettori dei test e2e, che girano contro `astro dev`. Spenta solo
  // quando li si esegue: nello sviluppo normale resta.
  devToolbar: { enabled: process.env.E2E !== '1' },
  adapter: vercel({
    // Inietta lo script di Vercel Web Analytics, servito da /_vercel/insights/
    // sullo stesso dominio: la CSP lo copre gia' con 'self'. Va acceso anche
    // dal pannello Vercel (scheda Analytics), altrimenti lo script parte ma
    // non ha dove scrivere.
    webAnalytics: { enabled: true },


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

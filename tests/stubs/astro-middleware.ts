// Stub di 'astro:middleware' per i test unitari: defineMiddleware serve solo a
// tipizzare, a runtime restituisce la funzione cosi' com'e'. Senza questo il
// middleware non e' importabile fuori da una build Astro, e l'unico test
// possibile sarebbe cercare stringhe nel sorgente.
export const defineMiddleware = <T>(fn: T): T => fn;

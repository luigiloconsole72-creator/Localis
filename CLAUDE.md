# LocalisGuide — istruzioni progetto

Sito audioguide (Astro 6, MDX, Netlify, R2 per audio, pnpm). Risposte in italiano.

## Percorso & shell (anti-errore #1 e #2)

- **Il progetto sta in `C:\Progetti\Sites\LocalisGuide`.** Dal 23/10/2026 il workspace non ha più la `&` nel percorso: niente junction (`C:\Dev` non esiste più).
- **Una shell sola per comando.** Niente sintassi bash dentro PowerShell e viceversa. `winget`/comandi Windows → PowerShell; pipe POSIX/heredoc → Bash.
- **Python sempre con `PYTHONIOENCODING=utf-8`** (evita UnicodeEncodeError su Windows).

## Verifica (standard unico)

- Typecheck: **`pnpm check`** (= `astro check`). NON `npx astro check` né `cd ... && node_modules/.bin/...`.
- Build: `pnpm build` · Test: `pnpm test`.
- Prima di dire "fatto" su modifiche non banali: `pnpm check` pulito, evidenza mostrata.

## Disciplina edit (anti-errore Read-before-Edit)

- **Read prima di ogni Edit/Write.** Non assumere il contenuto di un file — è l'errore #1 nei log (117 occorrenze).
- Edit fallita per "string not found" → ri-Read la zona esatta, non tentare a memoria.
- Mai cambiare dati/numeri/prezzi non richiesti. Segnalare prima di correggere.

## Regole di lavoro

- Dichiara le assunzioni, non indovinare.
- Se qualcosa non è chiaro nel codice o nei dati, chiedi.
- tocca solo quello che serve per il task
- modifiche chirurgiche, non toccare parti del file non necessarie al task
- mostrami solo il diff, non il file intero
- tieniti semplice, niente astrazioni "per il futuro": risolvi il problema di adesso
- non fare refactoring a meno che non sia espressamente richiesto.
- non fare promesse, se non sei sicuro chiedi.
- non modificare nulla senza aver prima verificato con pnpm check


## Posizionamento, copy & brand — leggi prima di scrivere

- Prima di OGNI lavoro su copy/posizionamento/brand/contenuti/blog/locandine: **leggi `BRAND.md`** (radice repo) — è il filtro editoriale, ogni pezzo deve passarlo.
- Contesto e decisioni nelle memorie `project_brand_north_star_baseline` (north-star, baseline GA4, sequencing caldo>SEO>ads) e `project_repositioning_capire_2026_06_25` (manifesto, momento d'ascolto, le 3 frasi a 3 altitudini).
- Chiodo bloccato: *"Le guide spiegano. Noi raccontiamo."* · "audioguida" solo in title/meta SEO, mai nel copy visibile · categoria ancora da nominare (sessione dedicata).

## Audio

- Produzione/rigenerazione audioguide → usa la skill **`/audio`** (incapsula dry-run, render per-capitolo, background, regole R2).
- `duration_seconds` / `start_seconds` SEMPRE da ffprobe reale, mai inventati.
- Mai caricare su R2 audio auto-generato senza file finale approvato dall'utente.

## Deploy

- **Vercel, NON Netlify** (migrato 2026-09-06). Push su `main` → deploy automatico. Verifica che il deploy parta davvero.
- Repo: `luigiloconsole72-creator/Localis` (trasferito da Domenico il 2026-09-06).
- Storage: Upstash Redis via `src/lib/kv.ts`, non piu' Netlify Blobs.

## Multilang

- Modifiche pagina → applica in parallelo IT + `en/` + `de/`. Push solo su richiesta esplicita.

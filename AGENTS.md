<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Regole di lavoro (sempre attive)

**Mindset:** ragiona come un **senior full-stack developer**. Pensa ad architettura, scalabilità, manutenibilità, sicurezza, edge case e DX prima di scrivere. Se una scelta ha trade-off, esplicitali brevemente. Anticipa problemi (race condition, n+1, validazione mancante, leak di segreti) invece di scoprirli dopo.

**UX-first, sempre:**
- Semplificare al massimo. Niente schermate sovraccariche, niente form monolitici con 20 campi.
- Quando un task è complesso (import dati, categorizzazione massiva, configurazione), usa **multi-step wizard**: una decisione alla volta, sempre con direzione chiara, "indietro" e "skip" disponibili.
- **Exception-Based Workflow**: l'utente non deve revisionare TUTTO, solo le eccezioni / ambiguità / casi nuovi. Quello che è deterministicamente sicuro si auto-conferma.
- Save progressivo: ogni step finale = persistenza immediata, no "salva tutto alla fine" che si perde se chiudi il tab.
- Niente "tabella di 1000 righe da revisionare" → raggruppa per pattern/vendor, mostra "prime 3 + vedi altre N", lascia l'utente confermare in bulk.

**Lingua:** italiano, semplice, senza gergo non spiegato.

**Stile risposte:** brevi e dirette. No preamboli ("Ok, allora..."), no riassunti finali se non richiesti. Risposta lunga solo se la domanda lo richiede davvero.

**Prima di scrivere codice:**
1. Leggi il file reale (con Read) prima di modificarlo — mai a memoria.
2. Verifica API/funzioni Next.js in `node_modules/next/dist/docs/` o con grep nel codebase. Non inventare.
3. Usa le librerie già in `package.json`, non aggiungere dipendenze nuove senza chiedere.

**Mentre scrivi codice:**
4. Solo quello che serve. Niente astrazioni speculative, niente codice "in più", niente commenti ovvi.
5. Rispetta lo schema DB in `src/lib/db/schema.ts` come fonte di verità.
6. TypeScript stretto — niente `any` se evitabile.

**Dopo aver scritto codice:**
7. Per modifiche non banali, lancia `npm run lint` o `tsc --noEmit` per verificare che non sia rotto. Riporta esito.
8. Mostra cosa è cambiato con riferimento `file:riga`, non descrizioni generiche.

**Azioni che richiedono conferma esplicita:**
- `npm install` (specie globali), aggiunta di nuove dipendenze.
- Comandi distruttivi: delete file, `git reset --hard`, `git push`, `rm -rf`.
- Modifiche a `.env.local`, `package.json`, config del sistema.
- Migrazioni DB applicate al DB reale (`drizzle-kit push`).

**Quando una richiesta è ambigua:** fai una proposta concreta motivata, non sommergere di domande. Procedi se la scelta è reversibile.

**Sicurezza e qualità (sempre):**
- **Mai segreti nel codice/commit.** `.env.local` deve restare in `.gitignore`. Niente chiavi API, password, token hard-coded.
- **Valida ogni input esterno con zod** — form, server actions, route handlers, params URL. Nessuna fiducia cieca nel `body` o nel `searchParams`.
- **Un task alla volta.** Niente mix di bug fix + feature nuova. Se trovo problemi collaterali, li segnalo invece di sistemarli di nascosto.
- **Operazioni DB multi-tabella → sempre in `db.transaction()`** (es. crea fattura + crea movimento + link). Evita stati incoerenti.
- **Distinzione Server / Client component esplicita.** Server di default; `'use client'` solo se servono hook, eventi, stato browser. Server Actions per mutazioni, no API routes inutili.
- **Niente `// @ts-ignore` o `any` muti.** Se proprio necessari, motiva in un commento di una riga.
- **Pulizia post-prova:** file di test temporanei o script ad-hoc vanno eliminati o segnalati.
- **Quando sono bloccato o incerto, lo dico subito.** Mai inventare API, mai andare a tentoni: meglio "verifico" che codice sbagliato.

**Stack di progetto (riferimento rapido):**
- Next.js 16 App Router + React 19 + TypeScript
- Drizzle ORM + Neon Postgres
- Auth.js v5 (Google SSO ristretto a `@wpaper.it`)
- Tailwind v4 + shadcn/ui
- react-hook-form + zod
- Vercel Blob per file
- Anthropic Claude SDK (claude-sonnet-4-6) per estrazione documenti e fallback descrizioni

# Architettura concordata (visione del prodotto)

**Filosofia di fondo: motore contabile classico + AI assistiva.** Stabile, auditabile, prevedibile, spiegabile. L'AI lavora SOLO dove il testo è sporco (parsing PDF, descrizioni bancarie illeggibili, fallback su pattern non riconosciuti). Mai per regole contabili, somme, matching matematici, transfer detection.

**Conti separati (semplificato):**
- 1 conto principale (banca)
- N conti secondari = "spazio separato": carta di credito, Revolut, contanti, altri (estendibile dall'utente)
- Ogni conto secondario ha saldo proprio + flusso di import dedicato
- Le **spese** dei conti secondari contano nel P&L (sono spese reali)
- I **trasferimenti** banca ↔ conto secondario (bonifico Revolut, addebito carta) NON contano come spese — sono solo movimentazione di liquidità
- Riconoscimento trasferimenti: prima volta marca manuale dall'utente → crea regola pattern → auto-applicata in futuro

**Pipeline core (deterministic-first, AI fallback):**
```
Import (wizard) → Normalizer (testo) → Rules Engine (keyword/pattern → vendor → categoria)
→ Transfer Detection (banca ↔ conti secondari) → Reconciliation (fattura ↔ movimento)
→ Analytics → Dashboard
```

**Confidence system su movimenti (95+/70-95/<70):**
- ≥ 95% → auto-conferma silenziosa
- 70-95% → suggerimento, l'utente conferma in bulk
- < 70% → review obbligatoria (la SOLA cosa che l'utente vede davvero)

**Exception-Based Workflow:** l'utente non vede mai tutte le 1300 righe. Vede solo eccezioni, ambiguità, vendor nuovi. Tutto ciò che è deterministicamente sicuro si auto-conferma.

**Categorizzazione multi-step (wizard a 5 step):**
1. Riepilogo iniziale (auto/bulk/ambigui/nuovi vendor)
2. Bulk approve raggruppato per pattern (prime 3 visibili + "vedi altre N")
3. Lista compatta righe ambigue inline + CategoryCombo + checkbox "salva regola"
4. Nuovi vendor da registrare
5. Riepilogo finale con stima copertura prossimo import
- Lista compatta inline (non swipe), salvataggio progressivo dopo ogni step, riprendi se chiudi a metà

**Dashboard separate (futuro):**
- **Financial**: saldi banca + saldi conti secondari + cashflow (include trasferimenti)
- **Economic**: P&L, EBITDA, margini (esclude trasferimenti tra conti)

**Tabelle chiave (concettuali, da implementare):**
- `accounts`: id, name, type (bank/credit_card/wallet/cash/other), currency, current_balance
- `movements`: + account_id, description_raw, description_normalized, is_transfer, transfer_group_id, confidence_score, hash_unique, vendor_id
- `vendors`: canonical_name, default_category_id (futuro: aliases)
- `categorization_rules`: ✅ già esistente
- `transaction_allocations`: transaction_id, employee_id, customer_id, project_id, amount (futuro)

**Fasi implementative concordate (in ordine):**
1. **F1 — Conti separati**: schema `accounts` + sidebar "Conti" + CRUD anagrafica + import dedicato per ogni conto + carta di credito come primo caso
2. **F2 — Riconoscimento trasferimenti**: flag `is_transfer` su movimenti + UI "marca come trasferimento verso conto X" + auto-rule dopo prima marcatura + esclusione automatica dal P&L
3. **F3 — Wizard categorizzazione 5-step** + grouping vendor + save progressivo
4. **F4 — hash_unique + confidence_score** su movimenti (dedup + tre soglie esplicite)
5. **F5 — Normalizer migliorato** (pulizia codici tecnici dalle descrizioni)
6. **F6 — Dashboard Financial vs Economic** separate
7. **F7 — Contabilità analitica** (allocations cliente/team/progetto)

**Cose rimandate (V2):**
- Vendor Dictionary con aliases complessi
- Acconti pre-fattura
- Open Banking / PSD2 sync automatico
- N↔M reconciliation avanzata

**Cose volutamente fuori scope:**
- Stampa fatture PDF / numerazione progressiva (WPaper usa Bluenext)
- Partita doppia / Piano dei conti (non serve per uso interno)

**Design system (regola ferrea — massimo 3 colori + neutri):**
- **Neutri** (bianco, grigi, nero) come base — testo, bordi, sfondi, stati attivi sottili. Non contano come "colore".
- **Blu** → CTA primarie, pulsanti d'azione principali, link, focus ring, selezione attiva forte.
- **Verde** → entrate, saldi positivi, fatture pagate, conferme di successo.
- **Rosso** → uscite, saldi negativi, fatture scadute, errori e azioni distruttive.
- **Vietato:** viola/arancio/giallo/ciano decorativi, gradients colorati, badge multicolore, accenti random per "abbellire". Se ti viene voglia di aggiungere un colore in più, NON farlo — usa peso del font, dimensione, o densità per dare gerarchia.
- Il campo `color` nelle categorie va usato solo come pallino piccolo (max 8px), non per colorare intere righe.
- Stile di riferimento: Notion / Linear / Vercel dashboard — minimale, denso, tipografia che fa il lavoro.

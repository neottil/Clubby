# 002 — Rimozione di /api/admin/promuovi e /api/admin/retrocedi

## Stato

- [x] Draft
- [x] Approvata
- [x] Completata

**Versioni**: `backend 2.8.0` (minor). Frontend e authorizer non toccati.

## Problema

`POST /api/admin/promuovi` e `POST /api/admin/retrocedi` concedono e tolgono il
privilegio di amministrazione. Fanno esattamente ciò che fa
`POST /api/admin/amministratore` con `{ utente_id, admin }`, al quale entrambe
delegano: nel servizio sono due righe che chiamano `impostaAdmin(id, true)` e
`impostaAdmin(id, false)`.

Nessuno le usa. Il frontend chiama solo `/amministratore`; la suite non le tocca.
Restano tre modi di fare la stessa cosa, di cui due non esercitati da niente —
quindi due percorsi che possono divergere senza che nessun test se ne accorga.

## Obiettivo

Un solo modo di cambiare il privilegio di amministrazione:
`POST /api/admin/amministratore`.

## Fuori perimetro

- `impostaAdmin` nel servizio **resta**: è la funzione vera, usata da
  `/amministratore`.
- Nessun cambiamento al comportamento di `/amministratore`, né ai permessi, né
  al divieto di togliersi il privilegio da soli (che applica l'authorizer).
- Gli altri endpoint `/api/admin/*` non si toccano.

## Requisiti

| # | Requisito | Test |
|---|---|---|
| R1 | `POST /api/admin/promuovi` risponde 404 | `richieste-non-valide.test.ts` — caso nuovo |
| R2 | `POST /api/admin/retrocedi` risponde 404 | idem |
| R3 | `POST /api/admin/amministratore` continua a concedere e togliere il privilegio | già coperto da `admin.test.ts` |

Riguarda il solo admin; nessuna pagina del frontend cambia.

## Modello dati

Nessuna variazione di schema.

## API

Due endpoint **rimossi**. Restano gestiti dal pattern generico
`/^\/api\/admin/` in `server.ts`, quindi una chiamata a quei percorsi cade nel
`return errorResponse(new NotFoundError('Route non trovata'))` in fondo
all'handler: **404**, che è la risposta corretta per una route che non esiste.

## Interfaccia

Nessuna modifica: il frontend non ha mai usato questi endpoint.

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| Rimuovere o deprecare | rimuovere | non esiste un client esterno da avvisare: l'unico consumatore dell'API è il frontend di Clubby, che non le usa |
| Due release | non serve | la regola delle due release protegge il **database**; qui non c'è schema, e nessun codice in esecuzione chiama questi percorsi |
| Versione | `minor` | cambia la superficie pubblica senza correggere un difetto. Letto in senso stretto sarebbe `major` (un endpoint sparisce), ma non esiste un client che possa rompersi |

## Rischi e impatti

Basso, ma con quattro punti fuori dal codice che vanno allineati nello stesso
passaggio, o resta documentazione che descrive qualcosa che non c'è più:

- `backend/docs/openapi.yaml` — righe 1276 e 1299
- `bruno/clubby/admin/02_promuovi_admin.bru` — l'unica richiesta salvata che le usa
- `README.md:253` — "Un admin può promuovere altri utenti tramite `POST /api/admin/promuovi`"
- `AGENTS.md` — la tabella degli endpoint non le elenca già oggi, quindi non va toccata

Se qualcuno avesse uno script personale che chiama `/promuovi`, smetterebbe di
funzionare: è il solo scenario in cui questa rimozione si nota, e la sostituzione
è una riga.

## Verifica

- **Suite API: 116/116** (era 115). Il caso nuovo in
  `richieste-non-valide.test.ts` copre R1 e R2 — 404 su entrambe le rotte — e
  R3, verificando che `/amministratore` continui a concedere e togliere il
  privilegio.
- `npm run build --prefix backend` pulito: nessun riferimento residuo alle due
  funzioni rimosse dal servizio.
- `backend/docs/openapi.yaml` riletto come YAML dopo la rimozione: valido,
  27 path.
- Ricerca delle occorrenze in tutto il repository: restano solo quelle in
  `.github/`, che parlano del "promuovi" del workflow Tag e non dell'endpoint.

### Rimosso

| File | Cosa |
|---|---|
| `backend/src/handlers/admin.ts` | i due rami e il commento che le citava come scorciatoie |
| `backend/src/service/admin.service.ts` | `promuoviAdmin`, `retrocediAdmin` (`impostaAdmin` resta) |
| `backend/docs/openapi.yaml` | i due path (46 righe) |
| `bruno/clubby/admin/02_promuovi_admin.bru` | la richiesta salvata |
| `README.md` | la riga che indicava `/promuovi` come modo per promuovere |

La numerazione delle richieste Bruno resta con un buco (manca la 2): Bruno
ordina per `seq` e tollera i salti, rinumerare sei file per estetica avrebbe
prodotto più rumore del buco.

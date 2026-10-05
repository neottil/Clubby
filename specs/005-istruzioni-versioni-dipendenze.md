# 005 — Istruzioni d'uso, versione dell'authorizer, vulnerabilità npm

> La pagina nata come **Istruzioni** si chiama **Manuale** (rotta `/manuale`),
> rinominata durante il test dell'utente: titolo e nome del file della spec
> restano quelli originali, perché sono il nome con cui è stata decisa.
>
> Raccoglie tre issue piccole e indipendenti, decise insieme perché toccano gli
> stessi moduli nella stessa release. Ciascuna ha i propri requisiti (R1–R…,
> V1–V…, N1–N…) e può essere chiusa anche separatamente.

## Stato

- [ ] Draft
- [x] Approvata
- [x] In test (utente)
- [ ] Completata

**Versioni**: `frontend 2.10.0` (minor: pagina Istruzioni, Info pubblica),
`authorizer 1.1.0` (minor: `GET /version`), `backend 2.11.0` (minor:
`/api/version` pubblica, `null` e versione del database; prima di V8 era un
patch, 2.10.1, mai rilasciato).

## Problema

1. **Istruzioni.** Chi entra in Clubby per la prima volta non ha un posto dove
   leggere come si usa. Le pagine cambiano molto da ruolo a ruolo (un socio vede
   solo i propri dati, un istruttore anche gli incontri che tiene, un admin
   tutto), e oggi l'unica spiegazione è chiedere a chi amministra il club.
2. **Versione dell'authorizer.** La pagina Info mostra frontend e backend ma non
   l'authorizer, che si deploya per conto suo: quando qualcosa non va
   nell'accesso non si sa quale versione stia girando. In più Info è
   raggiungibile solo dopo l'accesso, cioè proprio quando l'accesso funziona.
   Il workflow **Tag** non lascia un riepilogo: per sapere cosa ha promosso
   bisogna aprire il log del job.
3. **Vulnerabilità.** `npm install` segnala vulnerabilità *high*:
   - frontend, **di produzione**: `js-yaml` 4.0.0–4.3.1 (GHSA-2883-xcg3-v3hh),
     portato da `@mdxeditor/editor` ≤ 4.2.4 — sono le 2 segnalate da `npm audit --omit=dev`;
   - frontend e backend, **di sviluppo**: `brace-expansion` (GHSA-q2hr-2g5m-vwhr,
     GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p), da eslint e dalla copertura dei test.

   Authorizer e radice: nessuna vulnerabilità.

## Obiettivo

- Ogni utente trova, nel menu, una pagina **Istruzioni** che spiega le pagine
  che *lui* può usare, e solo quelle.
- La pagina **Info** mostra le versioni di frontend, backend e authorizer ed è
  raggiungibile anche senza accesso; il workflow Tag chiude con un riepilogo.
- `npm audit` è pulito in tutti i moduli.

## Fuori perimetro

- **Istruzioni modificabili dall'admin** (testo in database, editor Markdown):
  le istruzioni descrivono l'applicazione, non il club, e cambiano con il
  codice. Vedi Alternative scartate.
- **Screenshot o video** nelle istruzioni: invecchiano a ogni ritocco grafico e
  nessuno li rifà.
- **Guida contestuale** (un "?" su ogni pagina): è una feature a sé.
- **`npm audit` come controllo bloccante in CI**: utile, ma va deciso a parte
  (quale soglia, cosa fare con un advisory senza fix). Da aprire come issue.
- Pagine diverse da Info raggiungibili senza accesso.

## Requisiti

### Pagina Istruzioni

| # | Requisito | Test |
|---|---|---|
| R1 | Esiste la rotta `/manuale` e la voce di menu **Manuale** per ogni utente autenticato, subito prima di Info | manuale (frontend) |
| R2 | La pagina è composta di **sezioni**, ciascuna legata a una condizione: ruolo `socio`, ruolo `istruttore`, flag `admin`, modulo attivo. Si mostrano le sezioni la cui condizione è vera per chi la apre | manuale, con i tre account del seed |
| R3 | **Socio** (e chiunque abbia una scheda socio): come leggere il proprio voucher (saldo, movimenti, ultima ricarica), i propri incontri, e — se i moduli sono attivi — i propri tesseramenti e le ricevute raggiungibili da movimenti, incontri e tesseramenti | manuale, account socio |
| R4 | **Istruttore**: in aggiunta a R3, l'elenco voucher di tutti i soci (saldo sì, movimenti altrui no), la differenza fra gli incontri a cui partecipa come socio e quelli che tiene come istruttore, come registrare e correggere un incontro nelle attività a cui è abilitato, e la pagina **Resoconto** | manuale, account istruttore |
| R5 | **Admin**: tutte le pagine e le configurazioni — Soci, Voucher (creazione, ricariche, tagli), Incontri, Resoconti e rendicontazione, Tesseramenti, Ricevute (intestazione obbligatoria prima di emettere, irreversibilità dell'emissione), Impostazioni card per card (Ricariche, Tesseramento, Ricevute, Attività, Abilitazioni degli istruttori, Soci senza utente associato, Utenti - Soci) | manuale, account admin |
| R6 | Ruolo e privilegio admin si **sommano**: un admin istruttore vede le sezioni di entrambi. Una sezione non si ripete due volte | manuale, admin+istruttore |
| R7 | Le sezioni di un modulo spento (`tesseramento`, `ricevute`) **non compaiono**: le istruzioni non descrivono pagine che quel club non ha | manuale, con moduli accesi e spenti |
| R7-bis | Le **modalità di ricarica** si spiegano solo nella parte admin, e **tutte e tre** (importo libero, percentuale in più, tagli preconfigurati), con quella attiva evidenziata ("attiva per il tuo club"). Accanto, una nota: la modalità non si cambia dall'applicazione ma dalla configurazione dell'ambiente (`RECHARGE_MODE`), quindi per passare a un'altra va chiesto a chi gestisce l'installazione. Socio e istruttore non vedono nulla delle modalità | manuale, admin con le tre modalità; socio e istruttore |
| R8 | Un account senza scheda socio collegata (non admin) vede in cima una sezione che spiega cosa significa e a chi rivolgersi, coerente con l'avviso del Layout | manuale |
| R9 | Indice delle sezioni in testa, con ancore; leggibile a 375px senza scorrimento orizzontale | manuale, viewport mobile |
| R10 | Nessuna chiamata API nuova: la pagina usa ciò che il frontend già sa (`user`, `socioCollegato`, `config.moduli`, `config.modalitaRicarica`) | revisione del codice |

### Versioni e pagina Info

| # | Requisito | Test |
|---|---|---|
| V0 | **Un solo modello per le tre versioni**: la versione è il valore di `APP_VERSION` del componente, oppure **`null`** se la variabile manca o è vuota. Nessun ripiego su `"dev"` o altri valori inventati: una versione che non c'è si dice che non c'è | `tests/api/` + revisione |
| V1 | L'authorizer espone `GET /version` → `200 {"version": "<APP_VERSION>" \| null}` (V0). **Senza autenticazione**, con gli header CORS | `tests/api/` |
| V2 | `APP_VERSION` dell'authorizer arriva dal ConfigMap (`authorizer/k8s/configmap.yaml`), valorizzata da `deploy-authorizer.yml` con il tag dell'immagine, come già per backend e frontend | revisione + deploy di sviluppo |
| V3 | `GET /api/version` del backend diventa **pubblica**: gestita prima del controllo del JWT, accanto a `/health`. Si allinea a V0: `null` invece di `"dev"` quando `APP_VERSION` manca | `tests/api/` (con e senza token) |
| V3-bis | Anche il frontend si allinea a V0: `fetchFrontendVersion()` restituisce `null` se `/version.json` non esiste, non risponde o non ha `version`, invece di `"dev"` | revisione + manuale in locale |
| V3-ter | **Solo in sviluppo** (`vite dev`), se `/version.json` manca il frontend legge `VITE_APP_VERSION` da `frontend/.env.local`; vuota o assente → `null`. Nel bundle di produzione il ramo non esiste (`import.meta.env.DEV` è falso a build e Vite lo elimina): lì la versione resta solo quella di `/version.json` | manuale in locale + revisione del bundle |
| V4 | Info mostra tre righe: Frontend, Backend, **Authorizer**. Ciascuna ha tre stati distinti: *in caricamento* ("…"), *valore*, *non disponibile*. "Non disponibile" copre sia la richiesta fallita sia la versione `null`: in entrambi i casi non si sa cosa stia girando | manuale, in locale (tutte `null`) e in sviluppo |
| V5 | **Senza accesso** l'app mostra la navbar con il menu ridotto alla sola voce **Info**; `/info` è raggiungibile senza sessione. Le altre rotte continuano a portare a `/login` | manuale |
| V6 | Nel menu senza accesso non ci sono email né "Esci", ma una voce **Accedi** che porta a `/login` | manuale |
| V8 | **Versione del database**: `GET /api/version` restituisce anche `db`, il **numero dell'ultima migrazione applicata** al database dell'applicazione, letto dalla tabella `migrazione` (prefisso numerico del nome, es. `"003"` da `003_ricevute.sql`; l'ultima è quella con il nome maggiore, perché i nomi sono ordinabili per regola) | `tests/api/` |
| V9 | `db` è `null` se la tabella `migrazione` non esiste o è vuota, o se il database non risponde. In nessuno di questi casi l'endpoint fallisce: la versione del backend deve restare leggibile proprio quando il database è il problema | `tests/api/` (caso normale) + manuale a database spento |
| V10 | Info mostra una quarta riga **Database** con il valore di `db`, "non disponibile" se `null` o se la richiesta al backend fallisce | manuale |
| V7 | Il workflow **Tag** scrive in `$GITHUB_STEP_SUMMARY` una tabella con una riga per scope (backend, frontend, authorizer): tag di deploy, commit breve, versione, esito (`promosso`, `già promosso come …`, `mai deployato su main`), link alla Release; in fondo se la pulizia dei tag è stata lanciata e con quale scope | esecuzione del workflow |

### Vulnerabilità npm

| # | Requisito | Test |
|---|---|---|
| N1 | `npm audit` restituisce 0 vulnerabilità in `frontend`, `backend`, `authorizer` e radice | `npm audit` in ogni modulo |
| N2 | La correzione passa da `npm audit fix` (senza `--force`); se serve un salto di major (`@mdxeditor/editor`), si aggiorna la spec prima di farlo | revisione del lockfile |
| N3 | Dopo l'aggiornamento: build e lint del frontend, build del backend e suite API passano; l'editor Markdown delle ricevute (Impostazioni → Ricevute) apre, salva e mostra l'anteprima come prima | comandi della sezione Verifica + manuale |

## Modello dati

Nessuna variazione di schema.

## API

| Metodo | Percorso | Servizio | Autenticazione | Risposta |
|---|---|---|---|---|
| GET | `/version` | authorizer | **nessuna** (nuovo) | `{"version": string \| null}` |
| GET | `/api/version` | backend | **nessuna** (prima: JWT) | `{"version": string \| null, "db": string \| null}` (prima: `"dev"` al posto di `null`, e senza `db`) |

Da allineare: `backend/docs/openapi.yaml` (security vuota su `/api/version`),
`bruno/` (richiesta senza token per entrambe), la tabella degli endpoint in
`AGENTS.md` e `docs/readme/api.md`.

## Interfaccia

**Manuale** (`frontend/src/pages/ManualePage.tsx`). Il testo sta in un
modulo dedicato (`frontend/src/manuale/sezioni.tsx`): un array di sezioni
`{ id, titolo, visibile(ctx), contenuto }`, dove `ctx` contiene ruolo, flag
admin, scheda collegata, moduli e modalità di ricarica. La pagina filtra e
rende; il testo non è mescolato alla logica di filtro, così aggiornarlo non
richiede di leggere React. Stili da `styles/ui.ts`.

Ordine delle sezioni: prima ciò che vede chiunque (il proprio voucher, i propri
incontri), poi istruttore, poi amministrazione. I nomi di pagine, card e
pulsanti si scrivono **esattamente** come compaiono nell'interfaccia, in
grassetto, perché chi legge li cerca con l'occhio.

**Info senza accesso**. Senza sessione `ProtectedRoutes` registra solo `/info`,
dentro un `Layout` che, senza utente, riduce il menu a Info e Accedi; ogni altra
rotta torna a `/login`. Con la sessione aperta nulla cambia. Il caricamento
della sessione (`isLoading`) viene prima, così il menu ridotto non lampeggia.

Emerso in implementazione: perché Info sia davvero raggiungibile prima
dell'accesso, anche **la pagina di login sta dentro il `Layout`** (navbar e menu
ridotto): senza, da `/login` non ci sarebbe stato nessun modo di arrivarci se
non scrivendo l'indirizzo.

Le modalità di ricarica (R7-bis) stanno in un componente a parte,
`frontend/src/manuale/ModalitaRicariche.tsx`: un file che esporta sia dati
sia componenti rompe il fast refresh di Vite, e il lint lo rifiuta.

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| Dove sta il testo delle istruzioni | Nel codice del frontend, versionato | Descrive il comportamento dell'applicazione: deve cambiare nello stesso commit in cui cambia una pagina, e lo stesso testo vale per ogni club |
| Una pagina o tre | Una pagina, sezioni filtrate | Ruolo e admin sono indipendenti (AGENTS.md): tre pagine separate costringerebbero l'admin istruttore a leggerne due |
| Versione del backend prima dell'accesso | `/api/version` diventa pubblica | Info senza accesso serve proprio quando l'accesso non funziona; una riga "accedi per vederla" la renderebbe inutile in quel caso. La versione non è un dato del club |
| Endpoint dell'authorizer | `/version`, senza prefisso | L'authorizer non ha prefisso `/api` (vedi `/health`, `/auth/*`) |
| Versione assente | `null`, e Info mostra "non disponibile" | Con il ripiego su `"dev"` la riga "non disponibile" scattava solo a richiesta fallita: una variabile dimenticata nel deploy si travestiva da ambiente locale. Lo stesso modello per i tre componenti (V0) |
| Modalità di ricarica nelle istruzioni | Tutte e tre, quella attiva evidenziata, solo per l'admin | L'admin deve sapere che le altre esistono per poterle chiedere; la scelta sta in `RECHARGE_MODE`, fuori dalla sua portata |
| Versione del database | Numero dell'ultima migrazione applicata, dal registro `migrazione` | Ogni migrazione è già un passo censito dello schema, con nome ordinabile e riga di registro scritta nella stessa transazione del file: è una versione che esiste già, non serve inventarne una. Il numero basta a dire se il database di un club è indietro rispetto al codice (proposta dell'utente) |
| Dove esporre la versione del database | Campo `db` di `GET /api/version` | La legge chi legge già la versione del backend, con una chiamata sola; il database dell'applicazione è del backend |
| Versione del frontend in locale | `VITE_APP_VERSION`, solo in sviluppo | `/version.json` in locale non esiste. Il principio di non compilare la versione nel bundle (`.github/README.md`) resta intatto: il ramo vive solo in `vite dev` |
| Nome della pagina | **Manuale** | Scelto dall'utente durante il test: è il nome con cui si cerca la guida di un'applicazione, mentre "Istruzioni" suonava come un avviso da seguire una volta |
| Voce "Accedi" nel menu senza sessione | Sì | Altrimenti da `/info` l'unico modo di tornare al login è riscrivere l'indirizzo |
| Vulnerabilità di sviluppo | Si correggono anche quelle | Non finiscono nell'immagine, ma lasciarle rende `npm audit` rumoroso e nasconde la prossima di produzione |

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| Istruzioni in database, modificabili dall'admin con l'editor Markdown | Il testo invecchia senza che nessuno se ne accorga quando cambia una pagina; ogni club ne avrebbe una copia diversa da tenere allineata; serve una migrazione per un contenuto che non è un dato del club |
| Istruzioni in file Markdown serviti da nginx | Non si filtrano per ruolo senza parsarli nel browser, e il renderer Markdown esistente (`@mdxeditor`) è pesante e caricato in modo lazy solo per le ricevute |
| Tre pagine distinte (`/istruzioni/socio`, `/istruttore`, `/admin`) | Vedi Decisioni: rompe l'indipendenza di ruolo e privilegio admin |
| Info senza accesso con la sola versione del frontend | Mostrerebbe la versione meno utile proprio quando serve diagnosticare l'accesso |
| Esporre la versione dell'authorizer tramite il backend | Il backend dovrebbe chiamare l'authorizer a ogni richiesta, e un authorizer giù renderebbe "non disponibile" anche la riga del backend |
| Mostrare solo la modalità di ricarica attiva (prima stesura di R7) | L'admin non saprebbe che ne esistono altre, e quindi non potrebbe chiederle (scartata dall'utente in revisione) |
| Fallback `"dev"` quando `APP_VERSION` manca (comportamento attuale di backend e frontend) | Rende irraggiungibile lo stato "non disponibile" di Info e confonde una configurazione mancante con l'ambiente locale (scartata dall'utente in revisione) |
| Una tabella `versione_db` o un numero di schema scritto a mano | Duplicherebbe il registro `migrazione`, e un numero scritto a mano prima o poi diverge dai file applicati |
| Usare la data di applicazione (`applicata_il`) come versione | Dice *quando*, non *quale* schema: due club migrati in giorni diversi avrebbero lo stesso schema e versioni diverse |
| Restituire il nome completo della migrazione (`003_ricevute`) | Proposto e lasciato al solo numero, come chiesto: il nome si trova nel repository a partire dal numero |
| Versione anche del database dell'authorizer | Oggi non ha migrazioni proprie (vedi `authorizer/src/db/migrations/README.md`), quindi non c'è niente da numerare. Quando ne avrà, stesso modello su `GET /version` |
| `/version.json` in `frontend/public/` per lo sviluppo locale | Finirebbe dentro l'immagine; in cluster nginx lo nasconde con la location del ConfigMap, ma un file che esiste e non viene mai servito confonde chi lo trova |
| Chiamare la pagina **Istruzioni** (`/istruzioni`), nome della prima stesura | Sostituito da **Manuale** durante il test dell'utente. Nessun reindirizzamento dalla vecchia rotta: non è mai stata rilasciata, e un indirizzo sconosciuto torna comunque alla home |
| Distinguere in Info "non impostata" da "non raggiungibile" | Per chi legge la conseguenza è la stessa, non si sa cosa giri; il dettaglio sta nella risposta di rete |
| Lasciare la pagina di login fuori dal `Layout` | Info sarebbe stata raggiungibile prima dell'accesso solo scrivendo l'indirizzo a mano (emerso in implementazione) |
| `npm audit fix --force` | Può saltare major senza dirlo; il salto va visto e deciso (N2) |
| `overrides` in `package.json` per forzare `js-yaml` | Solo se `npm audit fix` non basta: un override sopravvive al motivo per cui è stato messo e nessuno lo toglie più |

## Rischi e impatti

- **`/api/version` pubblica**: espone la versione a chiunque. Accettato (vedi
  Decisioni); nessun dato del club. Il test che oggi si aspetta 401 senza token,
  se esiste, va aggiornato.
- **`APP_VERSION=dev` in locale**: `scripts/init-local.sh` lo scriveva nel
  `backend/.env`; ora non lo scrive più, così in locale Info mostra "non
  disponibile" come previsto. Un `backend/.env` già generato lo conserva finché
  non si toglie la riga a mano. In CI (`build-deploy.yml`) `APP_VERSION=test`
  è stato aggiunto anche all'authorizer.
- **`/api/version` tocca il database**: era l'unica cosa che il backend
  rispondeva senza il database. Un errore di connessione diventa `db: null`
  (V9), ma col database irraggiungibile la risposta può arrivare dopo il timeout
  di connessione del pool (5 secondi). La sonda di Kubernetes resta `/health`,
  che non lo tocca.
- **`version` può essere `null`**: cambia il contratto di `/api/version`. Nel
  repository nessuno legge il valore `"dev"` (controllato); in locale le tre
  righe di Info diventano "non disponibile", ed è voluto. In CI il backend ha
  `APP_VERSION=test`: il caso `null` si prova in locale.
- **Rotte senza sessione**: un errore in `App.tsx` potrebbe rendere raggiungibili
  pagine protette. Mitigazione: senza sessione si registra **solo** `/info`, il
  resto resta sul redirect a `/login`; il backend rifiuta comunque.
- **`@mdxeditor/editor`** aggiornato: tocca l'editor delle ricevute in
  Impostazioni. Verifica manuale in N3.
- **ConfigMap dell'authorizer**: variabile nuova in `deploy-authorizer.yml`
  (`VARS` di `envsubst`). Dimenticarla lascia `${APP_VERSION}` letterale nel
  ConfigMap. Da allineare `docs/readme/variabili-e-secret.md` e `manifest-k8s.md`.
- **Istruzioni che mentono**: il rischio vero della feature. Mitigazione: il
  testo nomina solo elementi esistenti; nuova riga nella regola 6 di AGENTS.md —
  *una modifica che cambia cosa vede un ruolo aggiorna anche
  `frontend/src/manuale/`*.
- Documentazione da allineare: `docs/readme/funzionalita.md` (pagina
  Istruzioni, Info pubblica), `docs/readme/api.md`, `.github/README.md`
  (riepilogo del Tag), `docs/readme/pipeline-ci-cd.md`.

## Test dell'utente

_Da compilare dall'utente._ Controlli già fatti in implementazione, in locale:

- Info senza accesso: menu con Info e Accedi; Frontend e Backend "non
  disponibile" (versione `null`), Authorizer con il valore di `APP_VERSION`
- Istruzioni con `luca.moretti` (socio), `marco.bianchi` (istruttore) e l'admin
  iniziale (senza scheda socio): ciascuno vede solo le proprie sezioni; all'admin
  le tre modalità di ricarica con `map` evidenziata
- 375px: nessuno scorrimento orizzontale
- Versione del database (V8–V10), aggiunta durante il test: `db: "003"` sul
  database locale, uguale all'ultima migrazione del repository (test in
  `tests/api/versioni.test.ts`); `db: null` in meno di un secondo con un backend
  puntato a un database irraggiungibile; riga **Database** in Info
- Pagina rinominata da **Istruzioni** a **Manuale** (richiesta dell'utente)
- Barra di scorrimento verticale accanto alle schede della pagina Ricevute
  (segnalata dall'utente): difetto preesistente del componente `Tabs`, non di
  questa spec. Corretto come bug fix, senza cambiare comportamento
- Manuale: tolta l'affermazione "per correggere un errore si registra un
  incontro di rettifica" (sezioni Resoconto e Resoconti), che non è vera;
  ora dice "Per correggere un errore contattare l'amministratore". Stessa
  correzione in `docs/readme/ruoli-e-permessi.md`
- Fuori da questa spec, emerso dal test: il seed (passo 06) segnava come
  documentate voci **senza ricevuta**, uno stato che l'applicazione non può
  produrre. Ora le voci documentate del seed sono solo quelle delle ricevute
  vere del passo 07, diventate tre (una per tipo di voce)
- `VITE_APP_VERSION` letta da `vite dev` (V3-ter) e assente dal bundle di produzione

Da provare: un admin che è anche istruttore e ha una scheda socio (R6), un
account senza scheda collegata (R8), moduli spenti (R7), il riepilogo del
workflow Tag alla prossima esecuzione (V7), l'editor Markdown delle ricevute
dopo l'aggiornamento di `@mdxeditor/editor` 4.2.3 → 4.3.2 (N3).

## Verifica

_Da compilare dopo il test dell'utente._

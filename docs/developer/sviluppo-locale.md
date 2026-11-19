# Sviluppo locale

Come si prepara e si avvia l'ambiente di sviluppo. Cosa fa il prodotto sta in
[docs/readme/](../readme/readme.md), le regole di lavoro in [AGENTS.md](../../AGENTS.md).


## Prerequisiti

- Docker + Docker Compose
- Node.js 24+
- npm
- `openssl` (per generare la chiave di firma dei token in `init-local.sh`)

## Avvio

1. Avvia PostgreSQL. Al primo avvio crea entrambi i database — quello
   dell'applicazione e quello degli account — con i rispettivi utenti:
   ```bash
   docker compose up -d
   ```
   Lo stesso comando avvia anche il servizio `migrazioni`, che applica le
   [migrazioni di schema](../readme/migrazioni.md) pendenti su entrambi i database e termina.
   Dopo aver aggiunto un file di migrazione, senza riavviare tutto: `npm run db:migra`.

2. Genera i file di configurazione:
   ```bash
   bash scripts/init-local.sh
   ```
   Lo script è **interattivo**: per ogni parametro (nome dell'associazione, URL dei
   servizi, credenziali del primo amministratore) mostra un valore predefinito fra
   parentesi quadre — premi Invio per accettarlo, o digita un valore diverso. Genera
   anche la chiave RSA con cui l'authorizer firma i token e scrive `backend/.env`,
   `authorizer/.env` e `frontend/.env.local`.

   In locale i [moduli opzionali](../readme/voucher-tesseramento-ricevute.md#moduli-opzionali) nascono **attivi**: lo script scrive
   `ENABLE_MODULE_TESSERAMENTO` e `ENABLE_MODULE_RICEVUTE` in `backend/.env` e le corrispondenti
   `VITE_ENABLE_MODULE_*` in `frontend/.env.local`. Per provare l'applicazione senza un modulo, metti
   `false` in **entrambi** i file: se i due valori non coincidono, il frontend mostra una pagina che il
   backend rifiuta, o nasconde un modulo che invece risponde.

   La pagina **Info** mostra "non disponibile" per le versioni che l'ambiente non dichiara, ed è
   quello che succede in locale. Per vederne una, la si imposta a mano: `APP_VERSION` in
   `backend/.env` e in `authorizer/.env`, `VITE_APP_VERSION` in `frontend/.env.local` (letta solo da
   `vite dev`, mai dal bundle di produzione). La riga **Database** non va impostata: è il numero
   dell'ultima migrazione applicata, letto dal database.

3. Installa le dipendenze dei tre moduli:
   ```bash
   npm run install:all
   ```

4. Avvia i tre moduli insieme:
   ```bash
   npm run dev
   ```
   In alternativa, separatamente: `npm run dev:backend`, `npm run dev:authorizer`,
   `npm run dev:frontend`.

5. Apri http://localhost:5173 e accedi con le credenziali scelte al punto 2. Al primo
   accesso ti verrà chiesto di sostituire la password.

L'amministratore iniziale viene creato solo se il database degli account è vuoto. Per
ripartire da zero: `docker compose down -v` e poi di nuovo `docker compose up -d`.

### Provare l'app installabile (PWA)

Con `npm run dev` il service worker **non** si registra: il dev server ricarica i moduli a ogni modifica,
e una cache davanti lo intralcerebbe. Per provare installazione, avviso "Aggiorna" e avvio offline
(spec 012) serve la build:

```bash
cd frontend
npm run build && npm run preview
```

e poi http://localhost:4173. Backend e authorizer restano quelli di `npm run dev`. In locale vale il
manifest statico `frontend/public/manifest.webmanifest`, con nome e logo di Clubby: quello di un club lo
genera il deploy. Per ripartire puliti dopo una prova: DevTools › Application › Storage › **Clear site
data**, che toglie service worker, cache e sessione salvata.

Le icone dell'app (`frontend/public/branding/icone/`) le genera `frontend/scripts/genera-icone.mjs`
prima di ogni `dev` e `build`, a partire dai loghi in `branding/`.

## Gestione container

| Comando | Descrizione |
|---------|-------------|
| `docker compose up -d` | Avvia PostgreSQL in background |
| `docker compose down` | Ferma i container |
| `docker compose down -v` | Reset completo (cancella anche i volumi e quindi i dati) |
| `docker compose logs -f postgres` | Log di PostgreSQL |

## Avvio in debug

### Backend
Avviare da launch vscode

### Frontend
Avviare l'app con npm run dev, avviare debugger da launch vscode

### .vscode/launch.json
```
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["tsx", "src/server.ts"],
      "cwd": "${workspaceFolder}/backend",
      "envFile": "${workspaceFolder}/backend/.env",
      "sourceMaps": true,
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Authorizer",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["tsx", "src/server.ts"],
      "cwd": "${workspaceFolder}/authorizer",
      "envFile": "${workspaceFolder}/authorizer/.env",
      "sourceMaps": true,
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "name": "Frontend (Chrome debug)",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:5173",
      "webRoot": "${workspaceFolder}/frontend/src",
      "sourceMapPathOverrides": {
        "/@fs/*": "${workspaceFolder}/frontend/src/*"
      }
    }
  ]
}
```


## Credenziali di test

`scripts/seed-demo-data.sh` **azzera i due database** e li ripopola: questi account, ciascuno collegato
alla propria scheda socio, più listino, abilitazioni, voucher, incontri, tesseramenti e una ricevuta
dimostrativa in PDF. Chiede conferma prima di cancellare, e non va mai puntato a un ambiente con dati
veri.

Le password non sono scritte qui: l'admin usa `INITIAL_ADMIN_PASSWORD` di
`authorizer/.env`, gli altri `DEMO_PASSWORD`, il cui valore predefinito è
documentato in [scripts/seed/README.md](../../scripts/seed/README.md). In questa
cartella non va mai scritta una credenziale, nemmeno di prova: è l'unico modo di
non dover decidere caso per caso se quella specifica è innocua.

| Account | Nominativo | Password | Ruolo | Admin |
|---------|------------|----------|-------|-------|
| admin@clubby.local | *(nessuna scheda socio)* | `INITIAL_ADMIN_PASSWORD` | socio | **sì** |
| marco.bianchi@clubby.dev | Marco Bianchi | `DEMO_PASSWORD` | istruttore | no |
| elena.ferrari@clubby.dev | Elena Ferrari | `DEMO_PASSWORD` | istruttore | no |
| luca.moretti@clubby.dev | Luca Moretti | `DEMO_PASSWORD` | socio | no |
| giulia.rinaldi@clubby.dev | Giulia Rinaldi | `DEMO_PASSWORD` | socio | no |
| davide.costa@clubby.dev | Davide Costa | `DEMO_PASSWORD` | socio | no |
| sara.vitali@clubby.dev | Sara Vitali | `DEMO_PASSWORD` | socio | no |

L'**amministratore è un account a sé**, senza scheda socio: ruolo nel club e privilegio di
amministrazione sono indipendenti, e tenerli separati nella demo è il modo più diretto di mostrarlo —
gli istruttori restano istruttori e basta, così si vede davvero cosa può fare chi non amministra.

C'è inoltre **Paolo Greco** (`paolo.greco@clubby.dev`), socio **senza account**: serve a provare dalle
Impostazioni il collegamento manuale di un account registrato in seguito, e a vedere come si presenta
un socio ancora senza dati.

**Sara Vitali** è il caso opposto e altrettanto utile: ha un account ma **nessun voucher**, e paga gli
incontri a parte. È l'unico modo di provare che un socio senza credito prepagato raggiunge comunque le
proprie ricevute, partendo dalla riga dell'incontro.

Il seed emette **tre ricevute dimostrative**, una per tipo di voce: su una ricarica, su un incontro di
Sara Vitali, che non ha voucher, e su un rinnovo del tesseramento — così tutti i percorsi con cui un
socio raggiunge una ricevuta sono visibili subito. Sono le uniche voci già documentate: il seed non
segna mai una voce come emessa senza la sua ricevuta, perché l'applicazione non può farlo.

Il seed riparte sempre da zero: azzera entrambi i database e li ricostruisce, quindi non serve più
buttare il volume per avere dati puliti (`docker compose down -v` resta utile solo per rifare lo
**schema** da capo). In cluster, invece, i dati ci sono
e non si buttano: le modifiche allo schema si applicano come migrazioni (vedi
[Migrazioni dello schema](../readme/migrazioni.md)).

## Test delle API

`tests/api/` verifica dall'esterno, con token veri, i permessi e i dati che ogni ruolo riceve: ruoli nel
token, visibilità degli incontri e totali di Incontri, Resoconto e Resoconti, listino e soci per ruolo,
regole di scrittura degli incontri e del voucher, ricevute e tesseramenti, modalità di ricarica, moduli
accesi e spenti, privilegio admin e ruolo, rifiuto di corpi malformati e di route inesistenti.

Si esegue con un comando solo, e serve soltanto **Docker acceso** (spec 014):

```bash
npm run test:api
```

Un file solo:

```bash
npm run test:api -- tests/api/ricariche.test.ts
```

La suite non usa né i servizi di `npm run dev` né il database di `docker compose`, e può girare mentre
sono accesi. Avvia con Testcontainers un PostgreSQL usa e getta, vi applica baseline e migrazioni, e per
ogni file di test clona due database e avvia backend e authorizer **dai sorgenti**, su porte libere e con
tutte le variabili impostate dalla suite (il tuo `.env` non conta). Prima di ogni caso i database tornano
vuoti, e ogni caso crea solo i dati che gli servono: il contatore delle ricevute, le impostazioni e i
dati del database di sviluppo restano come sono. A fine esecuzione, anche con Ctrl+C, container e
processi spariscono.

I file girano in parallelo, quattro alla volta; `TEST_PARALLELISMO` cambia il numero. Se un file
fallisce, sotto l'errore compaiono le ultime righe di log del suo backend e del suo authorizer.

Le dipendenze della suite stanno in `tests/package.json` e le installa `npm run install:all` (oppure
`npm install --prefix tests`).

**Debug.** In VS Code, la configurazione *Test API (debug)* di `.vscode/launch.json` chiede un file (vuoto
per tutti), esegue un file alla volta e collega il debugger anche al backend e all'authorizer avviati dalla
suite: i breakpoint nei sorgenti dei servizi e nei test funzionano insieme. Fuori da VS Code,
`TEST_DEBUG=1 npm run test:api -- <file>` avvia i servizi con `--inspect` su 9229 (backend) e 9230
(authorizer), a cui ci si collega con le due configurazioni *Attach* o con qualunque debugger.

**Su Windows si lancia da WSL**, come `npm run dev`: lì ci sono sia Node sia Docker, e Testcontainers
trova Docker da solo, senza configurazione. Lanciata da Windows, la suite non vedrebbe il Docker di WSL e
si fermerebbe subito con il messaggio "Docker non risponde".

## Su Windows si lavora da WSL

Su Windows con Docker dentro WSL (nessun Docker Desktop) **tutto si lancia da
WSL**: `npm run dev`, `npm run test:api`, `docker compose`, il seed. Node e npm
vanno installati in WSL; da lì i servizi si vedono fra loro su `localhost`, e il
browser in Windows li raggiunge su `localhost` grazie all'inoltro delle porte
di WSL.

| Strumento | Dove |
|---|---|
| `node`, `npm` | WSL |
| `docker`, `docker compose` | WSL (nessun Docker Desktop nel PATH di Windows) |
| `psql`, `pg_dump`, `pg_restore` | WSL |
| `jq`, `curl` | WSL |
| browser, VS Code | Windows (VS Code collegato a WSL) |

Due cose da sapere:

- **Se in WSL manca `node`, il seed ripiega su `node.exe` di Windows** per la
  sola ricevuta dimostrativa. Gli argomenti attraversano il confine
  WSL↔Windows, le variabili d'ambiente no: è il motivo per cui il seed passa i
  dati a Node via stdin come JSON e traduce i percorsi con `wslpath -w` — vedi
  [scripts/seed/07-ricevuta-dimostrativa.sh](../../scripts/seed/07-ricevuta-dimostrativa.sh).
- **Il `pg_dump` della shell può essere più vecchio del server.** Se è la 16 e il
  server è la 18 rifiuta di partire (`aborting because of server version
  mismatch`): si usa quello dentro il container, di pari versione.

## Dump e restore del database locale

Con il `pg_dump` del container, non con quello della shell (vedi sopra). Formato
custom: compresso, e permette il restore selettivo.

```bash
mkdir -p ~/clubby-backup && docker exec clubby-postgres pg_dump -U clubby -d clubby -Fc > ~/clubby-backup/clubby.dump
```

```bash
docker exec clubby-postgres pg_dump -U clubby -d clubby_auth -Fc > ~/clubby-backup/clubby_auth.dump
```

Per vedere cosa contiene un dump senza ripristinarlo:

```bash
docker exec -i clubby-postgres pg_restore -l < ~/clubby-backup/clubby.dump
```

Il restore ricrea il database: `pg_restore` su uno che contiene già quelle
tabelle va in errore su ogni oggetto. `--force` chiude le connessioni che
`npm run dev` tiene aperte — meglio comunque fermare i servizi prima, o si
ritrovano il pool appeso.

```bash
docker exec clubby-postgres dropdb -U clubby --force clubby && docker exec clubby-postgres createdb -U clubby -O clubby clubby && docker exec -i clubby-postgres pg_restore -U clubby -d clubby < ~/clubby-backup/clubby.dump
```

```bash
docker exec clubby-postgres dropdb -U clubby --force clubby_auth && docker exec clubby-postgres createdb -U clubby -O clubby_auth clubby_auth && docker exec -i clubby-postgres pg_restore -U clubby -d clubby_auth < ~/clubby-backup/clubby_auth.dump
```

Tre cose da sapere:

- **I due database vanno in coppia.** `socio.id_viewer` punta a un account che
  vive nell'altro database e nessun vincolo lo protegge: ripristinare solo
  `clubby` su un `clubby_auth` più recente lascia soci collegati ad account che
  non esistono, e l'unico sintomo è un socio che nessuno riesce a vedere.
- **Il dump degli account contiene gli hash delle password.** Va tenuto fuori dal
  repository: `backup/` non è in `.gitignore`.
- **Il dump porta lo schema com'era.** Ripristinando un dump vecchio su codice
  nuovo serve poi `npm run db:migra`, o `docker compose up -d` che lo fa da sé.

## Bump di versione

```bash
npm run version -- <backend|frontend|authorizer> <major|minor|patch>
```

Non crea né commit né tag Git: tocca solo `package.json` e `package-lock.json`
del modulo. I tag li crea il workflow **Tag**, a deploy avvenuto. Quando si alza
la versione e di quali moduli: regola 5 di [AGENTS.md](../../AGENTS.md).

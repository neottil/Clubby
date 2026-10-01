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

Il seed emette **due ricevute dimostrative**: una su una ricarica e una su un incontro di Sara Vitali,
che non ha voucher — così entrambi i percorsi con cui un socio raggiunge una ricevuta sono visibili
subito.

Il seed riparte sempre da zero: azzera entrambi i database e li ricostruisce, quindi non serve più
buttare il volume per avere dati puliti (`docker compose down -v` resta utile solo per rifare lo
**schema** da capo). In cluster, invece, i dati ci sono
e non si buttano: le modifiche allo schema si applicano come migrazioni (vedi
[Migrazioni dello schema](../readme/migrazioni.md)).

## Test delle API

`tests/api/` verifica dall'esterno, con token veri, i permessi e i dati che ogni ruolo riceve: ruoli nel
token, visibilità degli incontri e totali di Incontri, Resoconto e Resoconti, listino e soci per ruolo,
regole di scrittura degli incontri e del voucher, privilegio admin e ruolo, rifiuto di corpi malformati e
di route inesistenti. Richiede i servizi avviati
(`npm run dev`) e il database raggiungibile:

```bash
npm run test:api
```

I test non dipendono dai dati presenti né dal seed demo: ogni file crea i propri account, soci, attività,
voucher e incontri e li elimina alla fine, anche se un test fallisce o l'esecuzione viene interrotta.
I dati di prova sono riconoscibili a colpo d'occhio — email sul dominio `clubby.test`, nomi di soci e
attività che finiscono in `_test` (es. `mario_test rossi_test`, `educazione_test`) — e la pulizia elimina
solo quelli. Se dovessero restarne dopo un'interruzione brusca, li rimuove l'esecuzione successiva oppure:

```bash
npm run test:api:pulizia
```

La pulizia e il primo admin di prova passano direttamente dai database, con i parametri `DB_*` di
`backend/.env` e `authorizer/.env` (sostituibili con `TEST_APP_DB_URL` e `TEST_AUTH_DB_URL`); tutto il
resto si crea dalle API. `API_URL` e `AUTH_URL` cambiano gli indirizzi dei servizi.


## Gli strumenti non stanno tutti nella stessa shell

Su Windows con Docker dentro WSL gli strumenti si dividono, ed è la prima cosa
che fa perdere tempo a chi non lo sa:

| Strumento | Dove |
|---|---|
| `psql`, `pg_dump`, `pg_restore` | solo in WSL |
| `docker`, `docker compose` | solo in WSL (nessun Docker Desktop nel PATH di Windows) |
| `node`, `npm` | solo in Windows; da WSL si invoca `node.exe` |
| `jq`, `curl` | entrambe |

Tre conseguenze, tutte già pagate:

- **Da WSL `localhost` non è l'host Windows.** I servizi avviati da `npm run dev`
  si raggiungono con `http://$(ip route show default | cut -d" " -f3):3001`.
- **Gli argomenti attraversano il confine WSL↔Windows, le variabili d'ambiente
  no.** Un percorso va tradotto con `wslpath -w`, e un percorso Windows passato a
  un `import()` ESM vuole `pathToFileURL()`. È il motivo per cui il seed passa i
  dati a Node via stdin come JSON, e non dall'ambiente — vedi
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

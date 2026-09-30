# Clubby

Gestionale per associazioni sportive: soci, incontri, voucher prepagati,
tesseramenti e ricevute. Tre moduli indipendenti in un repository unico,
senza monorepo tool: ogni modulo ha il proprio `package.json` e le proprie
dipendenze.

## Stack

- **Frontend**: React 19 + Vite 7, React Router 7, TypeScript. Nessuna libreria
  di componenti né di stato: stili inline condivisi in `frontend/src/styles/ui.ts`.
- **Backend**: Node 24 + TypeScript, **senza framework HTTP** — `node:http` e una
  tabella di route in `backend/src/server.ts`. Dipendenze: `pg`, `jose`, `dotenv`.
- **Authorizer**: servizio separato per credenziali e token (JWT firmati RSA,
  JWKS pubblico). Ha un **database proprio**: il backend non vede le password.
- **Database**: PostgreSQL 18, due database distinti (`clubby`, `clubby_auth`).
- **Deploy**: k3s + Traefik su VPS, manifest in `<modulo>/k8s/` e `k8s/templates/`,
  pipeline GitHub Actions (vedi `.github/README.md`).

## Workflow Spec-Driven

Questo progetto segue un **workflow spec-driven**: prima si definisce la
specifica, poi si implementa.

### Flow (STRICT - seguire SEMPRE in questo ordine)

1. **Spec Phase**: Creare/aggiornare una spec in `specs/` con stato "Draft"
2. **Review**: Revisionare la specifica con il team
3. **Approval**: Approvare la spec → stato "Approvata"
4. **Implementation**: Implementare seguendo la spec (SOLO dopo approvazione)
5. **Test dell'utente**: l'implementazione finita porta la spec a "In test",
   **non** a Completata. È l'utente a provare la feature sui propri dati
6. **Verification**: Verificare che l'implementazione soddisfi la spec → stato "Completata"

### Regole (OBBLIGATORIE - non negoziabili)

1. **GATE: Mai implementare senza spec approvata**
   - PRIMA di scrivere qualsiasi codice, verificare che esista una spec in `specs/` con stato `[x] Approvata`
   - Se la spec non esiste → CREARE la spec (stato: Draft), poi chiedere approvazione
   - Se la spec esiste ma è in Draft → chiedere approvazione PRIMA di implementare
   - Se la spec è Approvata → implementare seguendo i requisiti documentati
   - **ECCEZIONE**: Bug fix che non cambia il comportamento documentato nella spec

2. **Una spec per feature** - Ogni cambiamento significativo ha la propria spec
   - Aggiungere una pagina → nuova spec
   - Aggiungere un endpoint API → aggiornare spec esistente o crearne una nuova
   - Modificare comportamento esistente → aggiornare spec esistente

3. **Spec living document** - Aggiornare la spec durante l'implementazione se necessario
   - Se durante l'implementazione si scopre che un requisito va cambiato, aggiornare la spec
   - Non implementare features extra non documentate nella spec

3-bis. **GATE: Mai marcare Completata senza il test dell'utente**
   - Finita l'implementazione, la spec passa a `[x] In test (utente)` e ci si
     ferma lì. Non si marca Completata da soli, nemmeno con la suite verde:
     i test automatici dicono che il codice fa quel che è scritto, non che
     quel che è scritto serva
   - Durante il test **la spec può ancora cambiare**: se la prova fa emergere
     un requisito sbagliato, mancante o scomodo, si aggiorna la spec e si
     rimette mano al codice, **senza aprire una spec nuova**
   - A test superato si compila la sezione **Verifica** e si marca Completata
   - Le sezioni `## Test dell'utente` e `## Verifica` sono due cose distinte:
     la prima è cosa ha provato l'utente, la seconda come si è controllato
     ogni requisito

4. **Testare dalla spec** - I test devono coprire i requisiti documentati
   - Ogni requisito nella spec deve avere almeno un test associato in `tests/api/`

5. **Bump delle versioni a ogni feature o fix**
   - Ogni spec implementata si chiude alzando la versione dei **soli moduli
     toccati**, con `npm run version -- <modulo> <major|minor|patch>`
   - `minor` per una feature, `patch` per un fix, `major` per un cambiamento
     che rompe i client esistenti
   - **Il bump non crea né commit né tag Git**: lo script della radice passa
     `--no-git-tag-version --no-commit-hooks`, quindi tocca solo `package.json`
     e `package-lock.json` del modulo. I tag li crea **esclusivamente** il
     workflow **Tag**, a deploy avvenuto — un agente non ne crea mai
   - Un modulo non modificato **non** si alza: la sua versione finirebbe su un
     tag che riferisce un'immagine identica alla precedente
   - La versione va nella spec, nella riga "Versioni" (vedi template)

6. **Allineare i README nello stesso passaggio**
   - Dopo ogni modifica, ricontrollare **tutti** i README del progetto e
     aggiornare quelli che la modifica ha reso falsi o incompleti. Non a fine
     lavoro, non "quando capita": nello stesso passaggio, o restano indietro
   - I README del progetto, e cosa descrive ciascuno:

     | File | Copre |
     |---|---|
     | `README.md` | il prodotto: cos'è, come si avvia, cosa fa |
     | `.github/README.md` | workflow, Environment, Variables e Secrets |
     | `backend/src/db/migrations/README.md` | come si scrive e applica una migrazione |
     | `authorizer/src/db/migrations/README.md` | idem per il database degli account |
     | `branding/README.md` | i loghi dei club e i formati richiesti |
     | `k8s/templates/openwa/README.md` | il componente OpenWA |

   - Non serve un aggiornamento per ciò che un lettore del README non nota mai
     (refactoring interno, formattazione, commenti). Serve per tutto ciò che
     cambia **comportamento osservabile**: comandi, variabili d'ambiente,
     endpoint, passi di avvio, struttura delle cartelle, vincoli nuovi
   - Un README che descrive qualcosa che non esiste più è peggio di un README
     mancante: il secondo manda a leggere il codice, il primo manda fuori strada

### Workflow in Pratica (come seguire le regole)

```
UTENTE: "Aggiungi la feature X"
AGENTE:
  1. Verifica se esiste una spec in specs/ per X
  2. Se NON esiste → CREARE la spec (Draft) → mostrare all'utente → chiedere approvazione
  3. Se esiste Draft → chiedere approvazione
  4. Se esiste Approvata → implementare
  5. Allineare i README resi falsi dalla modifica
  6. Bump delle versioni dei moduli toccati
  7. Dopo implementazione → marcare come "In test (utente)" e FERMARSI
  8. L'utente prova; se serve si corregge la spec e il codice, restando in test
  9. Solo a test superato → compilare "Verifica" e marcare Completata
```

### Directory Struttura

```
clubby/
├── specs/                  # Specifiche delle feature
│   └── template.md         # Template per nuove spec
├── backend/                # API (node:http + TypeScript)
│   ├── src/
│   │   ├── server.ts       # Tabella delle route
│   │   ├── handlers/       # Uno per risorsa: permessi e forma della risposta
│   │   ├── service/        # Logica e SQL
│   │   │   └── documenti/  # Ricevute: numerazione, PDF, importi in lettere
│   │   ├── db/             # schema.sql (baseline) + migrations/
│   │   ├── middleware/     # auth, errori, risposte
│   │   └── util/           # paginazione, ricerca, moduli, ricariche
│   └── k8s/                # manifest del solo backend
├── frontend/               # React + Vite
│   ├── src/{pages,components,hooks,api,auth,styles,utils}/
│   └── k8s/
├── authorizer/             # Credenziali e token, database proprio
│   ├── src/{crypto,service,middleware,db}/
│   └── k8s/
├── tests/api/              # Suite black-box via HTTP (node:test)
├── branding/               # loghi dei club (SVG per il browser, PNG per i PDF)
├── scripts/                # init-local, migra, seed-demo-data, copia-branding
├── k8s/templates/          # manifest applicati da Infra e dalle migrazioni
├── bruno/                  # Collezione di richieste API
├── .github/                # Workflow e relativo README
├── docker-compose.yml      # PostgreSQL + migrazioni
└── AGENTS.md               # Questo file (regole di lavoro)
```

### Commands

| Command | Descrizione |
|---------|-------------|
| `npm run install:all` | Installa le dipendenze dei tre moduli |
| `npm run dev` | Avvia backend, authorizer e frontend insieme |
| `npm run dev:backend` | Solo backend (porta 3000) |
| `npm run dev:authorizer` | Solo authorizer (porta 3001) |
| `npm run dev:frontend` | Solo frontend (porta 5173) |
| `npm run db:migra` | Applica le migrazioni pendenti ai due database |
| `npm run test:api` | Suite delle API (richiede i servizi avviati) |
| `npm run test:api:pulizia` | Rimuove i dati di prova rimasti da una suite interrotta |
| `npm run version -- <modulo> <major\|minor\|patch>` | Bump della versione di un modulo |
| `npm run build --prefix frontend` | Build del frontend — **è il vero type check** |
| `npm run build --prefix backend` | Compila il backend |
| `docker compose up -d` | PostgreSQL + migrazioni automatiche |
| `bash scripts/seed-demo-data.sh` | Dati di esempio (richiede l'authorizer avviato) |

### API Endpoints

Backend (`/api`, tutte autenticate con `Authorization: Bearer <jwt>`):

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/api/version` | GET | Versione del backend in esecuzione |
| `/api/auth/socio` | GET | Scheda socio di chi chiama (204 se non collegata) |
| `/api/soci` | GET/POST | Elenco paginato / creazione |
| `/api/soci/:id` | GET/PUT/DELETE | Scheda socio |
| `/api/attivita` | GET/POST | Listino delle attività |
| `/api/attivita/:id` | PUT/DELETE | Voce di listino |
| `/api/istruttori` | GET | Elenco istruttori |
| `/api/istruttori/:id/attivita` | PUT | Abilitazioni di un istruttore |
| `/api/incontri` | GET/POST | Elenco paginato / creazione |
| `/api/incontri/:id` | GET/PUT/DELETE | Incontro |
| `/api/incontri/rendiconta` | POST | Segna incontri come rendicontati (admin) |
| `/api/voucher` | GET/POST | Voucher prepagati |
| `/api/voucher/:id/movimenti` | GET/POST | Movimenti di un voucher |
| `/api/voucher/:id/ultima-ricarica` | GET | Data e importo dell'ultima ricarica (204 se nessuna) |
| `/api/ricarica-tagli` | GET/POST | Tagli di ricarica preconfigurati (admin) |
| `/api/ricarica-tagli/:id` | DELETE | Elimina un taglio |
| `/api/tesseramenti` | GET/POST | *(modulo tesseramento)* |
| `/api/tesseramenti/:socioId` | GET | Storico dei rinnovi: admin **o il socio stesso** *(modulo tesseramento)* |
| `/api/documenti/voci` | GET | Voci ancora da documentare *(modulo ricevute)* |
| `/api/documenti/anteprima` | POST | Anteprima della ricevuta, senza scrivere *(modulo ricevute)* |
| `/api/documenti` | GET/POST | Ricevute emesse / emissione *(modulo ricevute)* |
| `/api/documenti/:id` | GET | Scarica il PDF: admin o socio intestatario *(modulo ricevute)* |
| `/api/impostazioni` | GET/PUT | Quota di tesseramento, percentuale di ricarica, testi delle ricevute (admin) |
| `/api/admin/users` | GET | Account con la scheda socio collegata |
| `/api/admin/associa-viewer` | POST | Collega un account a una scheda socio |
| `/api/admin/associa-viewer/:socioId` | DELETE | Scollega |
| `/api/admin/ruolo` | POST | Ruolo nel club |
| `/api/admin/amministratore` | POST | Privilegio di amministrazione |
| `/api/admin/attivo` | POST | Attiva/disattiva un account |
| `/api/admin/reset-password` | POST | Password temporanea |

Authorizer (porta a sé, nessun prefisso `/api`):

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/auth/register` | POST | Registrazione |
| `/auth/login` | POST | Accesso |
| `/auth/refresh` | POST | Rinnovo dei token (refresh rotante) |
| `/auth/logout` | POST | Revoca del refresh token |
| `/auth/me` | GET | Account corrente |
| `/auth/cambia-password` | POST | Cambio password |
| `/.well-known/jwks.json` | GET | Chiavi pubbliche per la verifica dei token |
| `/health` | GET | Liveness (anche sul backend) |

> La tabella è mantenuta per comodità ma potrebbe essere obsoleta. Per la fonte
> di verità, consultare `ROUTES` in `backend/src/server.ts` e gli handler.

**Toccando un endpoint vanno allineati anche** `backend/docs/openapi.yaml` (la
specifica OpenAPI, scritta a mano) e la collezione di richieste in `bruno/`.
Sono due copie della stessa verità che nessun test verifica: se restano indietro
nessuno se ne accorge finché qualcuno non ci si fida.

### Ruoli e permessi

**Ruolo nel club** (uno per account) e **privilegio di amministrazione** sono
**indipendenti**: un admin può essere socio o istruttore, e un istruttore può
non amministrare nulla.

- `socio` — vede i propri incontri, il proprio voucher e i propri tesseramenti,
  in sola lettura, con le ricevute che li comprendono
- `istruttore` — registra e corregge gli incontri che tiene, nelle sole attività
  a cui è abilitato; come socio resta un socio
- `admin` (flag) — gestisce tutto: soci, listino, account, impostazioni,
  rendicontazione ed emissione delle ricevute

Il backend applica sempre i permessi: nascondere un pulsante nel frontend evita
un rifiuto inutile, non è il controllo.

### Moduli opzionali

Attivi **solo** con il valore esatto `true`, per ambiente:

| Variabile | Effetto |
|---|---|
| `ENABLE_MODULE_TESSERAMENTO` | Pagina Tesseramenti e route `/api/tesseramenti` |
| `ENABLE_MODULE_RICEVUTE` | Pagina Ricevute e route `/api/documenti` |
| `RECHARGE_MODE` | `free` (predefinito), `percentage`, `map` |

Una route di un modulo spento risponde **404, non 403**: un 403 direbbe a chi
non ha quel modulo che c'è qualcosa da comprare. Il frontend deve leggere gli
stessi interruttori da `config.moduli` e non mostrare ciò che il backend
rifiuterebbe. Il database resta unico: spegnere un modulo non cancella niente.

### Database (dev)

PostgreSQL su `localhost:5432` (docker-compose):

| | Applicazione | Account |
|---|---|---|
| Database | `clubby` | `clubby_auth` |
| Utente | `clubby` | `clubby_auth` |
| Password | `clubby` | `clubby_auth` |

**Seed di esempio**: `scripts/seed-demo-data.sh` — **azzera entrambi i database**
e li ripopola. Unico admin `admin@clubby.local` (password da
`INITIAL_ADMIN_PASSWORD`, nessuna scheda socio), gli altri account con
`DEMO_PASSWORD` (default `clubby2026`) — i due istruttori **non** sono admin.
Fra i soci, `sara.vitali@clubby.dev` non ha voucher (paga a parte) e
`paolo.greco@clubby.dev` è una scheda **senza account**, da collegare a mano. Chiede conferma interattiva; `SEED_FORZA=1` la salta. Sta fuori
dall'immagine Docker di proposito: azzera due database, e non deve essere a
portata di `kubectl exec` su uno staging.

### Migrazioni

`backend/src/db/schema.sql` è la **baseline** con cui si crea un database nuovo
e **non va più modificata**. Ogni variazione successiva è un file in
`backend/src/db/migrations/`, applicato da `scripts/migra.sh` — in locale dal
servizio `migrazioni` del compose, in cluster da un Job Kubernetes che gira
**prima** del rollout.

Tre regole, la terza è quella che conta:

1. Un file per migrazione, nome ordinabile (`002_descrizione.sql`).
2. Niente transazioni dentro al file: le mette il workflow, insieme alla riga di
   registro.
3. **Solo aggiunte.** Mai rinomine, `DROP` o cambi di tipo nella stessa release
   che introduce il codice che li usa.

Il motivo è l'ordine degli eventi: migrazione prima, deploy dopo. Un database
più avanti dell'applicazione è innocuo; un'applicazione più avanti del proprio
schema è rotta subito. Rimuovere qualcosa si fa in **due release**.

### Convenzioni del codice

- **Italiano** per nomi di dominio, commenti e messaggi d'errore rivolti
  all'utente. I commenti spiegano il *perché*, non il *cosa*.
- **Nessun `any`**: il frontend è a zero errori di lint, tenerlo così.
- **Errori**: `messaggioErrore(e)` nel frontend, mai `catch (e: any)`.
- **Terminatori di riga LF** (`.gitattributes` lo impone): uno script riscritto
  in CRLF rompe `bash` su Linux e nel container.
- **Paginazione**: filtri, ordinamento e totali li calcola il database
  sull'intero risultato filtrato, mai il browser sulle righe caricate.
- **Stili**: prima si guarda `frontend/src/styles/ui.ts`; una copia locale di
  uno stile condiviso è un difetto, non una personalizzazione.
- **Area documenti isolata**: `backend/src/service/documenti/` è scritta per
  poter diventare un servizio a sé. Il vincolo che lo rende possibile è uno
  solo: `pdf.ts` **non importa il client del database**. Chi genera un
  documento passa i dati, non un id.
- **Documentazione delle API**: `backend/docs/openapi.yaml` e `bruno/` si
  aggiornano **nello stesso passaggio** in cui cambia l'endpoint, non dopo.

### Test

`tests/api/` è una suite **black-box via HTTP**: richiede backend e authorizer
avviati e un database raggiungibile. Non è unit test — verifica le API come le
userebbe un client.

- I dati di prova si riconoscono dal suffisso `_test` e dal dominio
  `clubby.test`, e vengono rimossi alla fine anche se un test fallisce.
- I test creano i dati **dalle API**, come farebbe un admin; solo il primo admin
  e la pulizia passano dal database.
- Serve `RECHARGE_MODE=free`: in modalità `map` la creazione dei dati di prova
  viene rifiutata, non essendoci tagli configurati.
- In CI la suite gira nel job `test` di `build-deploy.yml`, contro le immagini
  appena buildate e un PostgreSQL usa-e-getta. **Blocca i deploy**, non le build.

### Chiudere quello che si è aperto

**Finite le prove, si spegne tutto ciò che si è acceso e si tolgono i dati che
si sono creati.** Non "se capita" e non "lo lascio su così puoi provare": chi
riprende in mano la macchina deve ritrovarla com'era.

- **Servizi**: ogni backend, authorizer, frontend o server di anteprima avviato
  per provare va fermato. Le porte 3000, 3001 e 5173 devono tornare libere, o
  restare occupate **solo** da processi che l'utente aveva già avviato per
  conto suo. Un'istanza dimenticata fa fallire il successivo `npm run dev` con
  un errore di porta occupata che sembra un guasto del progetto.
- **Dati**: i dati di prova creati a mano (soci, incontri, ricariche,
  tesseramenti, ricevute) vanno rimossi. La suite pulisce da sé anche fallendo;
  se è stata interrotta, o se si è creato qualcosa dall'interfaccia, si passa
  `npm run test:api:pulizia`.
- **Impostazioni**: quelle scritte per provare (quota, percentuale,
  intestazione e piè di pagina delle ricevute) sono **una riga sola per club**,
  non un dato riconoscibile dal suffisso `_test`: vanno rimesse com'erano.
- **Quello che non si può togliere va detto.** Una ricevuta emessa non si
  annulla: se una prova ne ha prodotta una, lo si dichiara all'utente con
  numero e anno, invece di lasciarla scoprire.

Nel messaggio finale si scrive **cosa è stato fermato e cosa è stato ripulito**,
così l'utente non deve controllare.

### Verifica prima di consegnare

| Cosa | Comando |
|---|---|
| Type check del frontend | `npm run build --prefix frontend` (non `tsc --noEmit`: usa un tsconfig più permissivo) |
| Lint del frontend | `npx eslint src --ext .ts,.tsx` da `frontend/` |
| Compilazione del backend | `npm run build --prefix backend` |
| Suite API | `npm run test:api` |
| Migrazioni da zero | container PostgreSQL vuoto + `schema.sql` + `scripts/migra.sh` |

### Git

- **Non committare** senza che l'utente lo chieda: rilegge il diff e fa le
  proprie prove prima.
- Le modifiche ai file si applicano direttamente, senza chiedere autorizzazione
  volta per volta.
- Prima di modificare qualcosa di esistente, verificare chi altro lo usa: un
  impatto su altre parti del sistema va esposto all'utente insieme al lavoro
  fatto.

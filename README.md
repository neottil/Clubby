# Clubby

Applicazione multi-tenant per la gestione di Associazioni Sportive Dilettantistiche (ASD).

## Funzionalità

- Gestione soci
- Gestione incontri, con note in testo semplice o in Markdown, filtrabili per attività e per periodo
- Listino delle attività con il relativo costo, gestito dal pannello Admin
- Attribuzione degli incontri a un istruttore, abilitato per singola attività
- Voucher prepagati, con il credito acquistato registrato come ricarica
- Tesseramento al club: scadenza per socio, rinnovi con storico e quota configurabile *(modulo opzionale)*
- Fatturazione: ricariche, quote di tesseramento e incontri non coperti da voucher, con i totali del periodo *(modulo opzionale)*
- Resoconto: un istruttore vede gli incontri che ha tenuto, con numero e costo complessivo del periodo filtrato
- Resoconti per l'admin: gli incontri di un istruttore o di un socio a scelta, filtrabili per periodo e attività
- Elenchi caricati a blocchi (incontri, movimenti, fatturazione, soci, voucher, tesseramenti, account),
  con ricerca e ordinamento applicati dal server, per non scaricare tutto a ogni apertura

## Architettura

Tre moduli applicativi, indipendenti fra loro e deployati separatamente:

- **Frontend**: React 19 + Vite + TypeScript
- **Backend** (`backend/`): Node.js 24, server HTTP nativo, i dati dell'associazione
- **Authorizer** (`authorizer/`): Node.js 24, autenticazione — account, ruoli, token
- **Database**: PostgreSQL 16, un'istanza con due database separati e utenti distinti
- **Deploy target**: Docker / Kubernetes su VPC privata

L'authorizer è l'unico a conoscere le credenziali degli utenti: ha un proprio database
con un proprio utente Postgres, a cui il backend non ha accesso. Firma i token con una
chiave privata RSA che non esce mai da lì, e ne pubblica la parte pubblica su
`/.well-known/jwks.json`; il backend la usa per verificare i token, e non può quindi
emetterne di propri.

## Modello utenti e ruoli

### Ruoli

Ogni account ha un **ruolo nel club** e, a parte, può avere il **privilegio di amministratore**.

Ruoli:

- **socio**: partecipa agli incontri e vede i propri dati (scheda, incontri, voucher, movimenti). È il
  ruolo di ogni nuovo account.
- **istruttore**: tiene incontri, che registra, modifica ed elimina dalla pagina Resoconto nelle sole
  attività a cui è abilitato. Può a sua volta partecipare come socio agli incontri di un altro
  istruttore: quelli restano nella pagina Incontri, in sola lettura. Vede inoltre l'elenco dei soci
  ridotto al nominativo e i saldi dei voucher.

Privilegio **admin**: amministra l'applicazione — account, ruoli, listino delle attività, abilitazioni,
soci e voucher — ed è indipendente dal ruolo, quindi un istruttore può essere admin. Si concede e si
toglie con la casella "Admin" nella card Utenti - Soci del pannello Admin; un admin non può toglierlo a sé
stesso.

Il ruolo sta dentro il token. Cambiarlo chiude tutte le sessioni aperte
dell'interessato: finché il token vecchio non scade porterebbe ancora i permessi
precedenti.

### Attività e abilitazioni

Le attività sono un listino a database (nome e costo proposto), gestito dal pannello Admin. Il costo è
unico per attività, e viene proposto quando la si sceglie in un incontro: il costo effettivo resta
sull'incontro, così un ritocco al listino non riscrive lo storico.

A ogni istruttore si assegnano le attività che può svolgere. È un vincolo, non un aiuto
all'inserimento: un istruttore che prova a registrare un incontro di un'attività non sua viene
rifiutato dal backend, anche chiamando l'API direttamente.

Un'attività con incontri collegati non è eliminabile — si disattiva: sparisce dalle scelte e resta
leggibile sullo storico.

### Incontri e resoconti

Un account può comparire in un incontro in due vesti, che l'interfaccia tiene separate: la pagina **Incontri**
mostra quelli a cui ha partecipato come socio, in sola lettura; la pagina **Resoconto** mostra a un istruttore
quelli che ha tenuto, con la stessa tabella, i totali del periodo nella riga dei filtri, e la possibilità di
registrarli e correggerli. L'admin, in Incontri, vede e gestisce tutti gli incontri; nella pagina **Resoconti**
consulta in sola lettura quelli di un istruttore (scheda "Per istruttore") o di un socio (scheda "Per socio"),
con gli stessi filtri e totali.

Filtri, ordinamento e totali sono calcolati dal database sull'intero risultato filtrato: gli elenchi arrivano a
blocchi, e un calcolo nel browser sulle sole righe caricate darebbe numeri falsi.

### Voucher, tesseramento e fatturazione

Un socio paga l'associazione in tre modi, tenuti distinti:

- **Voucher prepagato**: il socio acquista credito (movimento di tipo `ricarica`, positivo) e lo
  consuma (movimenti di tipo `addebito`, negativi). Gli addebiti nascono solo dagli incontri: vengono
  generati insieme all'incontro, ne conservano il riferimento e non si inseriscono a mano. Un admin
  registra a mano solo le ricariche, dal bottone "Ricarica" della pagina Voucher. Un voucher nuovo
  nasce senza credito: dopo averlo associato al socio si apre subito la ricarica, con cui si registra
  l'importo acquistato. Un voucher può anche nascere con un **saldo importato**, per portare in
  Clubby credito venduto prima di usarlo: non è un acquisto, sta dietro una spunta nel form.

  Nella pagina Voucher chi ha una scheda socio collegata, admin compresi, vede il proprio voucher in una
  card in cima, con i suoi movimenti. Sotto, in tabella, i voucher degli altri soci: l'admin li gestisce
  tutti, un istruttore ne vede i saldi ma non i movimenti, un socio non ha la tabella.
- **Tesseramento**: ogni rinnovo registra una scadenza e la quota pagata, proposta dal valore
  configurato nel pannello Admin. La quota non passa dal voucher, si paga a parte. La nuova scadenza
  deve seguire sia la data del rinnovo sia la scadenza precedente, e i rinnovi restano nello storico.
- **Incontri non coperti da voucher**: chi non ha un voucher paga l'incontro a parte.

La pagina **Fatturazione** (solo admin) somma esattamente queste tre cose: ricariche, quote e incontri
senza voucher, filtrabili per socio e per periodo. Restano fuori gli addebiti sul voucher — già
fatturati con la ricarica che li copre, contarli di nuovo raddoppierebbe l'importo — e il saldo
importato, che non è un incasso.

#### Moduli opzionali

Tesseramento e Fatturazione sono **moduli opzionali**, attivati per singolo ambiente dalle Variables
`ENABLE_MODULE_TESSERAMENTO` e `ENABLE_MODULE_FATTURAZIONE` (vedi
[Variables](#variables)). Valgono solo con il valore esatto `true`: una variabile mancante o scritta
diversamente lascia il modulo spento.

Con un modulo spento spariscono la voce di menu e la pagina, e le relative API rispondono `404` come
qualunque percorso inesistente — il controllo sta nel backend, il frontend evita soltanto di mostrare
sezioni che non funzionerebbero. Senza Tesseramento sparisce anche la configurazione della quota dal
pannello Admin.

I due moduli sono indipendenti: Fatturazione senza Tesseramento funziona (mancheranno le voci di quel
tipo), e Tesseramento senza Fatturazione registra rinnovi e quote che però nessuna pagina riepiloga.
Il database è sempre completo — niente migrazioni per accendere o spegnere un modulo, e lo storico si
ritrova intatto alla riaccensione.

### Dove vivono i dati delle persone

L'anagrafica — nome, cognome, telefono — sta **solo** sulla scheda socio, nel database
applicativo. L'authorizer custodisce credenziali e ruolo, e null'altro: l'unico dato anagrafico
che conosce è l'email, perché è ciò con cui si accede. Una copia in entrambi i servizi sarebbe
stata una doppia verità scrivibile, destinata a divergere.

Ne discende che un account non collegato ad alcun socio **non ha un nominativo**: nel pannello
admin compare con la sola email, ed è corretto — è tutto ciò che se ne sa.

### Registrazione

1. La persona si registra con **email e password**, nient'altro
2. L'authorizer crea l'account come `socio`, senza privilegio admin, e apre subito una sessione
3. Da quel momento la persona accede, ma **non vede alcun dato**: un avviso in interfaccia le
   dice che il suo account non è ancora collegato a una scheda socio
4. Un admin fa l'abbinamento dal pannello, e al primo accesso successivo la persona vede i propri
   dati

**Il collegamento è sempre manuale.** L'app non abbina mai nessuno da sola. C'è stato un aggancio
automatico basato sull'email, ed è stato tolto per due motivi concreti: l'indirizzo di un socio lo
digita un admin e nessuno lo verifica, quindi chi ne conoscesse uno poteva registrarsi con quello
ed ereditare voucher e incontri di un altro; e due schede che condividono un indirizzo — due
fratelli iscritti con l'email del genitore, tutt'altro che raro in un'associazione — rendevano
l'abbinamento un'ipotesi invece di un fatto. Anche il nome e il cognome non basterebbero, fra
omonimi, secondi nomi e refusi.

Il collegamento è `socio.id_viewer`, che contiene l'id dell'account (lo stesso valore del claim
`sub` dei suoi token).

### Cambiare l'email di un socio

Non si può, finché è collegato: quella è l'email del suo account. La via è registrare un account
nuovo con l'indirizzo nuovo, poi dal pannello **"Scollega e disattiva"** sul socio e collegarlo al
nuovo account. Le due azioni stanno in un bottone solo perché l'ordine conta: disattivare senza
prima scollegare lascerebbe il socio legato a un'utenza che non può più accedere.

Un account disattivato non viene eliminato: resta come traccia di chi ha operato in passato, e i
riferimenti che lo citano negli incontri e nelle abilitazioni — che stanno in un altro database,
dove nessuna foreign key può ripulirli — restano validi.

Nome, cognome e telefono restano invece modificabili da un admin in qualunque momento: di quelli
la scheda socio è l'unica fonte, non una copia.

### Admin principale

Creato dall'authorizer al primo avvio, **solo se il database degli utenti è ancora
vuoto**: su un'istanza già popolata il passaggio non tocca nulla. Deve cambiare la
password al primo accesso.

- **In locale**: email e password chieste da `scripts/init-local.sh` (default `admin@clubby.local` / `adminadmin`; la password deve avere almeno 10 caratteri)
- **Su cluster**: email dalla variabile `INITIAL_ADMIN_EMAIL` dell'Environment, password temporanea generata dalla pipeline [Infra](#infra), nessuna credenziale scritta nel codice

Un admin può promuovere altri utenti tramite `POST /api/admin/promuovi`.

### Sessione

Dopo l'accesso la sessione resta aperta finché la scheda del browser è aperta, fino a 30 giorni. Il token
di accesso dura 15 minuti e l'app lo rinnova da sola con il refresh token: prima della scadenza, al ritorno
sulla scheda dopo una pausa o una sospensione del computer, e al primo rifiuto per token scaduto. La
sessione si chiude con il logout, chiudendo la scheda, o quando un admin disattiva l'account, ne cambia
ruolo o privilegio, o ne azzera la password.

### Password dimenticata

Non c'è recupero self-service: il progetto non ha un servizio di posta. Un admin azzera
la password dalla pagina Admin, ottiene una password temporanea da consegnare
all'interessato, e questi la sostituisce al primo accesso.

## API

Le API sono documentate con due specifiche OpenAPI, una per servizio:

- [backend/docs/openapi.yaml](backend/docs/openapi.yaml) — soci, attività, istruttori, incontri,
  voucher, tesseramenti, fatturazione, impostazioni e amministrazione
- [authorizer/docs/openapi.yaml](authorizer/docs/openapi.yaml) — registrazione, accesso, sessioni,
  gestione degli account e chiavi pubbliche

Per ciascun endpoint riportano chi può chiamarlo, parametri, corpo, risposte ed errori. Gli endpoint
dei [moduli opzionali](#moduli-opzionali) esistono solo dove quel modulo è attivo: altrove rispondono
`404`, ed è segnalato sulla singola operazione.

Per
consultarle come pagina navigabile, si genera un HTML (da non committare):

```bash
npx @redocly/cli build-docs backend/docs/openapi.yaml -o api-backend.html
```

oppure si apre il file in [Swagger Editor](https://editor.swagger.io) o con un'estensione OpenAPI
dell'editor. Chi modifica un endpoint aggiorna la specifica del servizio nello stesso cambiamento;
per controllarla:

```bash
npx @redocly/cli lint backend/docs/openapi.yaml authorizer/docs/openapi.yaml
```

## Sviluppo locale

### Prerequisiti

- Docker + Docker Compose
- Node.js 24+
- npm
- `openssl` (per generare la chiave di firma dei token in `init-local.sh`)

### Avvio

1. Avvia PostgreSQL. Al primo avvio crea entrambi i database — quello
   dell'applicazione e quello degli account — con i rispettivi utenti:
   ```bash
   docker compose up -d
   ```

2. Genera i file di configurazione:
   ```bash
   bash scripts/init-local.sh
   ```
   Lo script è **interattivo**: per ogni parametro (nome dell'associazione, URL dei
   servizi, credenziali del primo amministratore) mostra un valore predefinito fra
   parentesi quadre — premi Invio per accettarlo, o digita un valore diverso. Genera
   anche la chiave RSA con cui l'authorizer firma i token e scrive `backend/.env`,
   `authorizer/.env` e `frontend/.env.local`.

   In locale i [moduli opzionali](#moduli-opzionali) nascono **attivi**: lo script scrive
   `ENABLE_MODULE_TESSERAMENTO` e `ENABLE_MODULE_FATTURAZIONE` in `backend/.env` e le corrispondenti
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

### Gestione container

| Comando | Descrizione |
|---------|-------------|
| `docker compose up -d` | Avvia PostgreSQL in background |
| `docker compose down` | Ferma i container |
| `docker compose down -v` | Reset completo (cancella anche i volumi e quindi i dati) |
| `docker compose logs -f postgres` | Log di PostgreSQL |

### Avvio in debug

#### Backend
Avviare da launch vscode

#### Frontend
Avviare l'app con npm run dev, avviare debugger da launch vscode

#### .vscode/launch.json
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


### Credenziali di test

`scripts/seed-demo-data.sh` crea questi account, ciascuno collegato alla propria scheda socio, insieme
a listino, abilitazioni, voucher e incontri di esempio. La password dell'admin è `INITIAL_ADMIN_PASSWORD`
di `authorizer/.env`:

| Account | Password | Ruolo | Admin |
|---------|----------|-------|-------|
| istruttore1@clubby.local | da `authorizer/.env` | istruttore | sì |
| istruttore2@clubby.local | clubby2026 | istruttore | no |
| socio1@clubby.local | clubby2026 | socio | no |
| socio2@clubby.local | clubby2026 | socio | no |
| socio3@clubby.local | clubby2026 | socio | no |

Gli schemi SQL non contengono migrazioni: per applicare una modifica allo schema si riparte da un database
vuoto (`docker compose down -v`, `docker compose up -d`) e si riesegue il seed.

### Test delle API

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

## Struttura progetto

```
Clubby/
├── .github/
│   └── workflows/
│       ├── infra.yml               # Provisiona i namespace + Postgres e i suoi database (manuale)
│       ├── build-deploy.yml        # Build immagini + deploy in sviluppo (i 3 moduli indipendenti)
│       ├── deploy-backend.yml      # Riutilizzabile (workflow_call): applica backend/k8s/*
│       ├── deploy-frontend.yml     # Riutilizzabile (workflow_call): applica frontend/k8s/*
│       ├── deploy-authorizer.yml   # Riutilizzabile (workflow_call): applica authorizer/k8s/*
│       ├── tag.yml                 # Crea/sposta i tag server-v*/client-v*/auth-v* + GitHub Release (manuale)
│       ├── promote.yml             # Deploy di una versione già taggata nell'ambiente di un club (manuale)
│       └── cleanup-build-tags.yml  # Ripulisce i tag <scope>-<branch>-* superati (manuale)
├── backend/
│   ├── src/
│   │   ├── handlers/       # Handler HTTP (soci, incontri, voucher, admin, auth, version)
│   │   ├── service/        # Business logic
│   │   ├── middleware/     # Verifica dei token, response helpers, classi di errore
│   │   ├── util/           # Paginazione degli elenchi (parametri e limiti comuni)
│   │   ├── db/             # Client del database (pg Pool) + schema SQL
│   │   └── server.ts       # Entry point HTTP (locale e produzione)
│   ├── docs/openapi.yaml   # Specifica OpenAPI delle API del backend
│   ├── k8s/                # Manifest con placeholder ${VAR}, applicati da deploy-backend.yml
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── authorizer/
│   ├── src/
│   │   ├── crypto/         # Hashing delle password (scrypt), firma dei token (RS256) e JWKS
│   │   ├── service/        # Account, ruoli, sessioni, password
│   │   ├── middleware/     # Verifica dei token, limitatore dei tentativi, classi di errore
│   │   ├── db/             # Client del database degli account + schema SQL
│   │   └── server.ts       # Entry point HTTP
│   ├── docs/openapi.yaml   # Specifica OpenAPI delle API dell'authorizer
│   ├── k8s/                # Manifest con placeholder ${VAR}, applicati da deploy-authorizer.yml
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── auth/           # AuthContext + client dell'authorizer (authApi.ts)
│   │   ├── api/            # API client factory
│   │   ├── pages/          # SociPage, IncontriPage, VouchersPage, ResocontoPage, ResocontiAdminPage, TesseramentiPage, FatturazionePage, AdminPage, InfoPage, LoginPage, CambioPasswordPage
│   │   ├── components/     # Layout, ElencoIncontri, CardCollassabile, Avviso, Modal, TableScroll, IntestazioneOrdinabile, CaricaAltri, TotaliFiltri, Etichetta, SearchSelect, DateRangeFilter, MarkdownEditor
│   │   ├── styles/ui.ts    # Stili comuni (pulsanti, form, tabelle), inclusi da ogni pagina
│   │   ├── utils/formato.ts # Formati di importi e date
│   │   └── config.ts       # Configurazione runtime (URL dei servizi, tenant) + fetch /version.json
│   ├── k8s/                # Manifest con placeholder ${VAR}, applicati da deploy-frontend.yml
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── k8s/
│   └── templates/infra/    # Manifest ${VAR}, gestiti da Infra: i due namespace e Postgres
├── scripts/
│   ├── init-local.sh          # Genera i .env dei tre moduli e la chiave di firma (interattivo)
│   ├── init-auth-db.sh        # Crea database e utente dell'authorizer al primo avvio del Postgres locale (docker-compose)
│   ├── seed-demo-data.sh      # Popola dati e account di esempio
│   └── setup-vps-k3s.sh       # Setup k3s + Traefik + cert-manager/Let's Encrypt sulla VPS
├── tests/
│   └── api/                # Test delle API con dati di prova propri (npm run test:api)
├── docker-compose.yml
└── package.json            # Script "dev" per avviare i tre moduli insieme, "test:api" per i test
```

## Multi-tenant

Ogni tenant (club) è un **Environment GitHub** a sé, e il nome dell'Environment decide tutto il resto:

| Cosa | Nome | Esempio (Environment `romaasd`) |
|---|---|---|
| Namespace dell'applicazione | `clubby-<env>-app` | `clubby-romaasd-app` |
| Database dell'applicazione, e il suo utente | `<env>-clubby` | `romaasd-clubby` |
| Database degli account, e il suo utente | `<env>-auth` | `romaasd-auth` |
| Cartelle dei manifest sulla VPS | `/opt/clubby/<env>/k8s`, `/opt/clubby/<env>/infra` | `/opt/clubby/romaasd/k8s` |

Il nome dell'Environment deve essere usabile come nome di namespace: lettere minuscole, cifre e trattini,
al massimo 52 caratteri. Va scelto una volta: cambiarlo equivale a creare un club nuovo, vuoto.

L'**istanza Postgres** invece non è per club: è quella del namespace indicato dalla variabile
`DB_NAMESPACE`, e più club possono indicare lo stesso. Tipicamente i club in produzione condividono
un'istanza e `development` ne ha una sua. Sull'istanza ogni club ha i propri database e i propri utenti,
senza accesso a quelli degli altri. L'isolamento è quindi a livello di deploy e di database, non
applicativo: non esiste un `tenant_id` condiviso in un unico database.

Le immagini Docker sono le stesse per tutti i club; ciò che li distingue arriva al deploy:
- backend e authorizer ricevono database, indirizzi e credenziali dai ConfigMap e Secret del proprio
  namespace;
- il frontend legge all'avvio `/config.json`, generato dalle Variables dell'Environment: nome del club
  (`TENANT_NAME`), colori (`THEME_*`) e logo (`LOGO_FILE`, uno dei file in `frontend/public/branding/`,
  inclusi nell'immagine).

Attività, costi e istruttori **non** sono variabili d'ambiente: sono dati del tenant, gestiti dal
pannello Admin della sua istanza. Cambiarli non richiede una nuova build del frontend, e le
abilitazioni degli istruttori devono comunque stare dove sta il controllo, non nel bundle del browser.

## Deploy (VPC / Kubernetes)

- **Backend e authorizer**: raggiungono Postgres con il nome completo del Service nel namespace
  `DB_NAMESPACE`, che le pipeline ricavano da sole
- **Authorizer**: hostname pubblico proprio (`AUTH_DOMAIN`), perché il browser vi accede direttamente
- **Verifica dei token**: il backend scarica la chiave pubblica dall'authorizer e non possiede quella privata
- **Secrets**: usare il secret manager del provider cloud scelto
- **Database**: PostgreSQL 16 gestito (RDS, Cloud SQL, o self-hosted)

### Variabili d'ambiente

Vedi la tabella completa in [Variabili e secret da configurare su GitHub](#variabili-e-secret-da-configurare-su-github).

## K8s

### Scelte fatte

- **Database**: PostgreSQL self-hosted come **istanza condivisa** nel namespace `DB_NAMESPACE`, su cui
  ogni club ha due database e due utenti distinti (`<env>-clubby` per l'applicazione, `<env>-auth` per
  gli account), non un SaaS esterno tipo Neon/Supabase né un operator come CloudNativePG. Un'istanza
  per più club risparmia risorse su una VPS piccola con mole di dati ridotta (piccole ASD) — non serve
  HA multi-replica né un operator dedicato in questa fase. Contrappeso accettato: un problema al pod
  Postgres impatta tutti i club che la condividono. La separazione che conta è quella degli **utenti**
  Postgres: ognuno può collegarsi solo al proprio database, quindi il backend di un club non legge né i
  dati degli altri club né le credenziali degli account.
- **Istanze separate dove serve**: `development` usa un `DB_NAMESPACE` diverso da quello dei club in
  produzione, così un `DROP` sbagliato o un riavvio in sviluppo non tocca la produzione.
- **Persistenza**: un solo PersistentVolumeClaim (PVC) per l'istanza Postgres.
- **Backup**: CronJob Kubernetes che esegue `pg_dump` periodico verso storage esterno (es. bucket
  S3-compatible self-hosted, aws s3). Da definire in dettaglio in fase di implementazione.
- **Multi-tenant**: un namespace applicativo per club (backend, frontend, authorizer) e i suoi due
  database sull'istanza condivisa, coerente con quanto descritto in [Multi-tenant](#multi-tenant).

**Stato attuale**: due pipeline distinte, scope separato (vedi [Pipeline CI/CD](#pipeline-cicd-github-actions)):
**Infra** provisiona i namespace e Postgres coi suoi due database (una tantum, o quando serve ricreare
l'infrastruttura); **Build & Deploy** gestisce i tre moduli applicativi, assumendo che
l'infrastruttura di base esista già.

### Setup iniziale del cluster (VPS)

**Nessuna pipeline esegue questo passaggio: va lanciato a mano, una volta sola**, sulla VPS di produzione,
prima di qualsiasi altra pipeline (Infra compresa). È un bootstrap a livello di host (installa k3s stesso),
diverso da tutto ciò che gira *dentro* un cluster già esistente: qui il cluster non esiste ancora,
quindi non c'è modo di farlo girare come Job, e richiede accesso root diretto alla VPS:

```bash
LETSENCRYPT_EMAIL=admin@tuodominio.com sudo -E bash scripts/setup-vps-k3s.sh
```

Lo script ([scripts/setup-vps-k3s.sh](scripts/setup-vps-k3s.sh)) è idempotente (rieseguibile senza effetti
collaterali) e si occupa di:

1. Installare **k3s** (distribuzione Kubernetes leggera, adatta a una singola VPS). k3s include già
   **Traefik** come Ingress Controller di default — non va installato separatamente.
2. Configurare `kubectl` per l'utente di deploy (`DEPLOY_USER`, tipicamente lo stesso `SSH_USER` usato
   dalla pipeline) copiando il kubeconfig generato da k3s in `~/.kube/config`.
3. Installare **cert-manager** e creare due `ClusterIssuer`:
   - `letsencrypt-staging` — per test, nessun limite di rate reale (certificati non fidati dai browser)
   - `letsencrypt` — produzione, usato dall'annotazione `cert-manager.io/cluster-issuer` nei template
     [backend/k8s/ingress.yaml](backend/k8s/ingress.yaml) e
     [authorizer/k8s/ingress.yaml](authorizer/k8s/ingress.yaml)

Entrambi risolvono la ACME challenge **HTTP-01** tramite Traefik (`ingressClassName: traefik`).

**I certificati si rinnovano automaticamente, nessuna azione manuale richiesta.** cert-manager tiene traccia
della scadenza di ogni certificato (i certificati Let's Encrypt durano 90 giorni) e ne richiede uno nuovo
in automatico circa 2/3 della validità prima della scadenza (quindi tipicamente intorno al giorno ~60),
aggiornando il Secret TLS referenziato dall'Ingress senza downtime. L'unica condizione è che cert-manager
resti in esecuzione nel cluster e che l'host risolva ancora pubblicamente verso la VPS (challenge HTTP-01).

Dopo lo script, il passo successivo è lanciare la pipeline **[Infra](#infra)** (una tantum per
ambiente) per creare i namespace e Postgres — solo dopo, **Build & Deploy** può funzionare.

### Struttura architetturale per namespace

Un namespace applicativo per ambiente (development o club), e un namespace per ogni istanza Postgres,
condivisibile da più ambienti.

```
clubby-<env>-app/                  es. clubby-development-app, clubby-romaasd-app
├── Deployment  backend        (immagine clubby-backend)                                    [deploy]
├── Deployment  frontend       (immagine clubby-frontend, statica dietro Ingress)           [deploy]
├── Deployment  authorizer     (immagine clubby-authorizer)                                 [deploy]
├── Service     backend, frontend, authorizer                                               [deploy]
├── Ingress     clubby-backend (host dell'app, path /api, possiede la richiesta TLS)        [deploy]
├── Ingress     clubby-frontend (stesso host, path /, stesso secretName TLS del backend)    [deploy]
├── Ingress     clubby-authorizer (host proprio AUTH_DOMAIN, TLS separato)                    [deploy]
├── Secret      clubby-secrets (DB_PASSWORD)                                                [deploy]
├── Secret      clubby-auth-secrets (AUTH_DB_PASSWORD, chiave di firma, admin iniziale)     [deploy]
├── Secret      ghcr-secret (imagePullSecrets: pull immagini private da ghcr.io)            [deploy]
├── ConfigMap   clubby-config (DB_*, AUTH_ISSUER, AUTH_INTERNAL_URL, PORT)                  [deploy]
├── ConfigMap   clubby-auth-config (DB_*, AUTH_ISSUER, CORS_ORIGIN, PORT)                   [deploy]
└── ConfigMap   clubby-frontend-config (/version.json e /config.json del club)              [deploy]

<DB_NAMESPACE>/                    es. postgres-dev, postgres-prod
├── Deployment  postgres (istanza condivisa, creata solo se manca, con PVC)   [infra]
├── Service     postgres                                                      [infra]
├── Service     postgres-external (NodePort, solo se DB_NODE_PORT impostata)  [infra]
├── PVC         postgres                                                      [infra]
└── Secret      postgres-superuser (password del superutente, solo nel cluster) [infra]
    sull'istanza, per ogni club: database <env>-clubby e <env>-auth, utenti omonimi   [infra]
```

`[deploy]` = applicato dai workflow di deploy, chiamati da **Build & Deploy** (development) e da
**Promote** (club).
`[infra]` = applicato dal workflow **Infra** — va lanciato prima, una tantum per ambiente.

Le risorse nel namespace del database hanno nomi **neutri**, non legati a Clubby né a un club: l'istanza
è un servizio condiviso. Specifici di un club sono solo i suoi database e i loro utenti.

I moduli applicativi raggiungono Postgres attraverso il nome completo del Service,
`postgres.<DB_NAMESPACE>.svc.cluster.local`: il nome breve funzionerebbe solo
all'interno dello stesso namespace.

### Pipeline CI/CD (GitHub Actions)

Sette workflow in [.github/workflows](.github/workflows), scope separato: **Infra** provisiona una
tantum namespace e Postgres; **Build & Deploy** builda e deploya i tre moduli in sviluppo a ogni push;
**Deploy Backend**/**Deploy Frontend**/**Deploy Authorizer** sono workflow riutilizzabili (nessun
trigger proprio) che applicano davvero i manifest k8s, chiamati sia da `Build & Deploy` sia da
`Promote`; **Tag** promuove manualmente un deploy a "versione reale" (senza deployare nulla);
**Promote** deploya una versione già taggata nell'ambiente di un club (senza taggare nulla).

**GitHub Environments**: `Build & Deploy` e `Tag` sono agganciati (job-level `environment: development`)
sempre e solo all'Environment `development` — ogni push builda e deploya in sviluppo, mai in un club.
`Infra` e `Promote` ricevono invece l'Environment come input (di tipo `environment`: il menu a tendina in
GitHub mostra gli Environment realmente configurati sul repo) e agganciano i job a quello scelto: `Infra`
per preparare `development` o un club, `Promote` per portare una versione in un club (rifiuta
`development`). Le **Variables/Secrets** vanno quindi configurate per Environment (Settings →
Environments), uno per `development` e uno per ogni club.

Namespace, nomi dei database e cartelle sulla VPS **non** sono Variables: li ricava dal nome
dell'Environment l'action [`.github/actions/ambiente`](.github/actions/ambiente/action.yml), che valida il
nome ed è usata da Infra e da tutti i workflow di deploy, così la convenzione è scritta in un punto solo.
`Promote` riusa le immagini Docker già pushate su `ghcr.io` da `Build & Deploy` (già taggate per versione
reale da `Tag`) — nessun rebuild.

#### Infra

Workflow: [infra.yml](.github/workflows/infra.yml).

**Attivazione manuale** (`workflow_dispatch`), con un solo input: `environment` — l'Environment GitHub su
cui agire, `development` o un club. L'email del primo admin non si inserisce al lancio: è la Variable
`INITIAL_ADMIN_EMAIL` dell'Environment, la stessa letta dal deploy dell'authorizer, e Infra si ferma se
manca. Aggancia il job all'Environment scelto,
quindi legge le Variables/Secrets configurate su **quell'Environment**. Da lanciare una tantum per
ambiente, prima del primo deploy, o quando serve riallineare l'infrastruttura. **Presuppone che
`scripts/setup-vps-k3s.sh` sia già stato eseguito a mano sulla VPS** (k3s, Traefik e cert-manager devono
esistere): questa pipeline parte da un cluster già funzionante, non lo crea. È idempotente, quindi
rieseguibile senza distruggere dati esistenti.

1. Genera i valori casuali del club (`openssl`): `DB_PASSWORD`, `AUTH_DB_PASSWORD`, la chiave privata RSA
   `AUTH_JWT_PRIVATE_KEY` con cui l'authorizer firma i token e la password temporanea del primo admin —
   **a meno che non esistano già come Secrets sull'Environment**, nel qual caso li riusa. È indispensabile
   per rilanciare Infra in sicurezza: una chiave di firma nuova invaliderebbe tutti i token in
   circolazione.
2. Renderizza i template [k8s/templates/infra](k8s/templates/infra) con `envsubst` e li copia sulla VPS
   via SSH, insieme agli schemi SQL dei due database.
3. Via SSH:
   - crea, se mancano, il namespace dell'applicazione (`clubby-<env>-app`) e quello dell'istanza
     Postgres (`DB_NAMESPACE`);
   - **crea l'istanza Postgres solo se in quel namespace non esiste**: il Secret con la password del
     superutente (generata al momento, resta solo nel cluster e nessun club la conosce), il volume e il
     Deployment. Se l'istanza esiste già — magari creata da un altro club — la riusa senza modificarla:
     riapplicarla con i valori di questo ambiente potrebbe cambiarla per tutti (es. il volume);
   - sull'istanza crea, se mancano, i database `<env>-clubby` e `<env>-auth` e i loro utenti omonimi, ne
     riallinea le password ai Secrets dell'Environment e toglie a qualunque altro utente la possibilità
     di collegarsi a quei database;
   - applica gli schemi dei due database come loro proprietari. Gli schemi sono idempotenti: riapplicarli
     su un database già popolato non tocca i dati.

Database e utenti non li creano script di init di Postgres: quelli girano solo al primo avvio
dell'istanza, e su un'istanza condivisa i club successivi non avrebbero mai i propri database.

L'utente admin iniziale **non** viene creato qui: lo crea l'authorizer al suo primo avvio (durante
`Build & Deploy`), leggendo `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD`, e solo se il database degli
account è ancora vuoto.

Il riepilogo della run (`GITHUB_STEP_SUMMARY`) stampa i valori da copiare a mano nei GitHub
Secrets/Variables — **visibili in chiaro una sola volta**, non vengono salvati altrove: copiali subito.
Lo step gira **sempre** (`if: always()`), anche se un passo precedente fallisce: i secret generati a
inizio run vengono comunque mostrati, così puoi copiarli nell'Environment prima di rilanciare Infra, che
li riuserà.

**Nota sull'issuer**: `AUTH_ISSUER` (`https://` + `AUTH_DOMAIN`, costruito dalle pipeline, non è una
variabile GitHub a sé) deve essere l'**URL pubblico HTTPS** dell'authorizer, non un indirizzo interno al
cluster. L'authorizer lo scrive nel claim `iss` dei token e il backend lo confronta esattamente
([backend/src/middleware/auth.ts](backend/src/middleware/auth.ts)): un `AUTH_DOMAIN` sbagliato farebbe
fallire ogni verifica. Il backend raggiunge però l'authorizer sul Service interno
(`AUTH_INTERNAL_URL`), che è cosa diversa e non deve coincidere.

#### `Build & Deploy` ([build-deploy.yml](.github/workflows/build-deploy.yml))

Si attiva su push su `main`, `feature/**`, `fix/**` (o manualmente). Tutti i branch deployano sullo
**stesso ambiente**, `development` (namespace `clubby-development-app`, a cui il workflow è sempre
agganciato — `environment: development` su ogni job): ogni push su uno di questi branch sovrascrive il
deploy corrente in sviluppo. I club si aggiornano con **Promote**, che riusa le immagini Docker già
pushate su `ghcr.io` da questo workflow, senza rebuild.

**Backend e frontend sono due scope completamente indipendenti**, ciascuno con i propri manifest k8s
colocati nel proprio folder — `backend/k8s/` e `frontend/k8s/` (niente più un `k8s/templates/app/`
condiviso) — e il proprio tag Git `<scope>-<branch>-<data>` (es. `backend-main-20260716_1317`,
`frontend-feature-login-page-20260716_1317`; `/` nel nome branch diventa `-`). **Un solo tag per scope**,
non due: serve sia da baseline per il diff della run successiva sullo stesso branch, sia da riferimento per
il workflow **Tag** (vedi sotto) — niente più distinzione tra tag "di build" e tag "di deploy".

Job separati per scope, ciascuno gira **solo** se serve davvero, e **non tocca mai** il Deployment k8s
dell'altro componente se quello non è cambiato (nessun riavvio/rollout inutile). Il job `versions` diffa
`HEAD` contro l'ultimo tag `<scope>-<branch>-*` —
**per ciascuno scope indipendentemente**, limitato al proprio folder (`backend/` o `frontend/`, `k8s/`
incluso in quanto sottocartella) — e decide:
- qualcosa sotto `backend/` (o `frontend/`), **escluso** `backend/k8s/` (o `frontend/k8s/`), è cambiato →
  builda una nuova immagine e la deploya
- solo `backend/k8s/*.yaml` (o `frontend/k8s/*.yaml`) è cambiato → **nessun rebuild**, ma il manifest viene
  comunque riapplicato, riusando **l'ultima immagine di quello scope effettivamente deployata con successo**
  (mai `:latest`: cerca l'ultimo tag `<scope>-<branch>-*`)
- nessuna modifica rilevante per uno scope → il suo job di deploy non gira affatto, il Deployment resta
  esattamente com'era
- nessuna modifica in nessuno dei due scope → l'intera run si ferma dopo `versions` (nessuna build, nessun
  deploy, nessun tag spostato), con un `::warning::` nel log

Se non trova nessun tag `<scope>-<branch>-*` precedente per uno scope su questo branch (prima run in
assoluto, o dopo una pulizia con il workflow **Cleanup build tags**, vedi sotto), builda e deploya sempre
tutto per quello scope, per sicurezza.

**Forzare tutto** — lanciandolo manualmente c'è l'input `force_all` (default `false`): se attivo, il diff
viene ignorato e sia backend che frontend vengono ribuildati e rideployati. Serve quando lo stato del cluster
non è più deducibile dalla history dei commit: il caso tipico è un namespace ricreato da zero, dove ConfigMap
e Secret applicativi non esistono più ma per il diff "non è cambiato niente", quindi senza forzatura i job di
deploy non girerebbero affatto.

**Come avanza il tag `<scope>-<branch>-*`**, sempre a fine job (`register-backend-tag`/`register-frontend-tag`,
dopo che il job di deploy corrispondente è andato a buon fine):
- se c'era un **rebuild**: crea un tag **nuovo** (`<scope>-<branch>-<data-di-questa-run>`), sul commit appena
  deployato — riferisce la nuova immagine appena pushata.
- se era un deploy **manifest-only** (nessun rebuild): **sposta in avanti** (force-update) il tag
  **esistente** più recente di quello scope sul commit di questa run, **senza rinominarlo** — il nome resta
  invariato (quindi continua a riferire correttamente la stessa vecchia immagine, mai spostata), ma il tag
  ora segna "fino a qui il manifest è già stato applicato", cosicché la prossima run non rilevi di nuovo lo
  stesso cambiamento già gestito.

Job (per ciascuno scope: nomi mostrati per `backend`, `frontend` è identico):

1. **versions**: legge il campo `version` di `backend/package.json` e `frontend/package.json`, calcola un
   **tag di data** `<branch>-yyyymmdd_HHMM` (UTC) univoco per questa run (usato per le immagini Docker e
   come base del nome dei tag Git di ciascuno scope).
2. **build-backend** (condizionale, vedi sopra): la **compilazione avviene qui, nella pipeline** (`npm ci &&
   npm run build`), non nel Dockerfile — `backend/Dockerfile` si limita a impacchettare l'output già
   compilato (`dist/`) in un'immagine Node runtime (per il frontend: build Vite + immagine nginx, senza
   alcuna configurazione del club, che arriva al deploy in `/config.json`). Le immagini
   vengono pushate su GitHub Container Registry (`ghcr.io`) taggate **solo** con il tag di data
   (branch-scoped) e con `latest` — il tag di versione reale (`X.Y.Z`) viene assegnato in seguito dal
   workflow Tag, solo dopo la promozione.
3. **resolve-backend-image** (condizionale, vedi sopra): decide quale tag immagine questa run deve
   deployare — il tag di data appena pushato se c'è stato un rebuild, altrimenti l'ultimo tag
   `backend-<branch>-*` esistente (immagine riusata, nessun rebuild). Logica specifica di questa run
   (branch, history dei tag): resta fuori dal workflow riutilizzabile di deploy al punto successivo.
4. **deploy-backend**: chiama il workflow riutilizzabile [`deploy-backend.yml`](.github/workflows/deploy-backend.yml)
   con `environment: development` e il tag risolto al punto precedente — applica **solo** i manifest sotto
   `backend/k8s/` (`configmap.yaml`, `secret.yaml`, `deployment.yaml`, `service.yaml`, `ingress.yaml` —
   quest'ultimo possiede la richiesta TLS/cert-manager per l'host condiviso), poi `kubectl rollout status`
   sul solo Deployment backend. Lo stesso identico workflow è chiamato anche da **Promote** per i
   club (vedi sotto) — nessuna logica di deploy duplicata tra i due contesti.
5. **register-backend-tag**: solo dopo un deploy riuscito, crea/sposta il tag `backend-<branch>-*` (vedi
   sopra "Come avanza il tag").
6. **cleanup-registry**: dopo almeno un deploy riuscito, ripulisce dal registry le immagini taggate solo con
   la data, mantenendo le **3 più recenti** per repository immagine (`clubby-backend`,
   `clubby-frontend`), a prescindere dal branch. I tag di versione reale (`X.Y.Z`) sono sempre esclusi
   da questa pulizia. Non usa più `actions/delete-package-versions` (dismessa, girava forzata su un runtime
   Node deprecato): usa direttamente l'API di GitHub Packages via `gh api`.

I manifest renderizzati (`k8s/rendered/`, contengono credenziali in chiaro) non vengono mai committati
(vedi `.gitignore`) e vivono solo per la durata della run della pipeline.

#### `Cleanup build tags` ([cleanup-build-tags.yml](.github/workflows/cleanup-build-tags.yml))

**Attivazione manuale**, oppure **automatica** (fire-and-forget) alla fine di ogni promozione riuscita del
workflow **Tag**, scoped a `branch=main` e `preserve_latest=true` (e a `scope` limitato al solo scope
appena promosso, se **Tag** ne ha promosso uno solo in quella run — vedi sotto). I tag `<scope>-<branch>-*`
**non sono usa-e-getta**: sono anche la baseline del diff della prossima run di `Build & Deploy` su quel
branch e il riferimento del workflow **Tag** — per questo, di default (`preserve_latest=true`), per
ciascuno scope e per ciascun branch coinvolto viene sempre **mantenuto il tag più recente** (Git e immagine
Docker corrispondente), eliminando solo quelli più vecchi. Così è sicuro lanciarlo — anche in automatico —
su un branch ancora attivo come `main`: dopo la pulizia resta comunque un tag da cui `Build & Deploy` può
calcolare il prossimo diff.

Accetta quattro input:
- `scope` (opzionale): `backend`, `frontend`, o vuoto per **entrambi** (default). Backend e frontend sono
  processati come scope completamente indipendenti (tag Git, immagini Docker, tutto separato) — questo
  input limita la pulizia a uno solo dei due. Usato dal trigger automatico da **Tag** quando ha promosso un
  solo scope in quella run (l'altro non è cambiato, non c'è motivo di ripulirlo). Per una pulizia manuale di
  un branch `feature/**`/`fix/**` concluso, di solito si lascia vuoto (entrambi gli scope).
- `branch` (opzionale): se valorizzato (es. `main`, `feature/x`), ripulisce **solo** i tag di quel branch —
  sia Git (`backend-<branch>-*`, `frontend-<branch>-*`) sia le immagini Docker corrispondenti su `ghcr.io`
  (`clubby-backend`/`clubby-frontend`), tramite l'API di GitHub Packages (non
  `actions/delete-package-versions`, che non supporta un filtro per tag). Se vuoto, ripulisce i tag di
  **tutti** i branch (`preserve_latest` si applica per singolo branch, non globalmente). In tutti i casi,
  un'immagine il cui digest è aliasato anche da un tag di versione reale (`X.Y.Z`) viene sempre saltata, mai
  eliminata.
- `preserve_latest` (default `true`): mantiene il tag più recente per scope+branch, elimina solo i più
  vecchi. Mettilo a `false` **solo** quando un branch `feature/**`/`fix/**` è concluso e mergiato — in quel
  caso nessuno dei suoi tag serve più a nessuno e si può ripulire per intero (la prossima run di
  `Build & Deploy` su quel branch, se mai ce ne sarà un'altra, ribuilderà/redeployerà tutto da capo).
- `dry_run` (default `true`): elenca solo cosa verrebbe eliminato (tag Git e immagini Docker), senza
  cancellare nulla.

#### `Tag` ([tag.yml](.github/workflows/tag.yml))

**Attivazione manuale** (`workflow_dispatch`, nessun input, tab Actions → Tag → Run workflow): non parte da
solo dopo `Build & Deploy`. Anche questo workflow è sempre agganciato all'Environment `dev`
(`environment: development`): assegna il tag di versione reale alle immagini già buildate in sviluppo, e crea
la GitHub Release corrispondente. **Non deploya nulla** — il deploy nei club di una versione già
taggata qui è compito separato del workflow **Promote** (vedi sotto). Promuove sempre e solo **main**, per
costruzione (vedi sotto) — coerente col fatto che `feature/**` e `fix/**` deployano sullo stesso namespace di
sviluppo di `main` e non rappresentano una produzione separata.

Non prende in input l'ID di una run di `Build & Deploy` da promuovere: dato che backend e frontend deployano
in modo indipendente (vedi sopra), non esiste "la run da promuovere" — ogni scope avanza per conto suo,
potenzialmente in run diverse. Agisce **solo sugli scope che ne hanno davvero bisogno**: non sposta mai un tag
di versione reale se quello scope non ha nulla di nuovo da promuovere. Per ciascuno dei due scope (`backend`,
`frontend`), il workflow:

1. Cerca l'ultimo tag `<scope>-main-*` (creato/avanzato da `deploy-backend`/`deploy-frontend` solo dopo un
   rollout riuscito, vedi sopra) — se non lo trova, **salta** quello scope (non è mai stato deployato su
   main, non c'è nulla da promuovere; non è più un errore fatale).
2. Controlla se il commit di quel tag è **già coperto da un tag di versione reale** (`git tag --points-at
   <commit>` filtrato su `server-v*`/`client-v*`) — se sì, quello scope è già stato promosso l'ultima volta:
   **salta** (nessuno spostamento di tag, nessun ri-tag Docker). Questo controllo si basa solo sui tag Git già
   nel repo — niente artifact né `run_id` da `Build & Deploy`: backend e frontend buildano/promuovono in run
   indipendenti e asincrone, quindi "l'ultima run di Build & Deploy" non sarebbe comunque un riferimento
   affidabile su cosa è cambiato dall'ultima promozione (i tag Git, essendo stato persistente nel repo, lo sono).
3. Se invece c'è qualcosa di nuovo, legge la versione dal `package.json` **al commit di quel tag specifico**
   (`git show <tag>:<scope>/package.json` — non da `HEAD`: backend e frontend possono essere più
   avanti/indietro l'uno rispetto all'altro).
4. **Crea o sposta** (force-update) il tag di versione reale corrispondente su quel commit:

   | Scope | Tag reale | Fonte versione |
   |---|---|---|
   | `backend` | `server-vX.Y.Z` | `backend/package.json` → `version` |
   | `frontend` | `client-vX.Y.Z` | `frontend/package.json` → `version` |

5. **Assegna il tag di versione reale** (`X.Y.Z`) all'immagine già pushata col tag di data ricavato dal nome
   del tag `<scope>-*` stesso (nessuna variabile/artifact separato), tramite `docker buildx imagetools
   create` (nessun rebuild: aggiunge solo un riferimento sullo stesso digest già presente sul registry).
6. **Crea la GitHub Release** per quel tag di versione reale (idempotente: se esiste già — es. dopo uno
   spostamento del tag sullo stesso nome — la lascia invariata invece di fallire).
7. Se **almeno uno** scope è stato promosso, **triggera** (fire-and-forget, non aspetta che finisca) il
   workflow **Cleanup build tags** scoped a `branch=main` e `preserve_latest=true`, per ripulire i tag
   `backend-main-*`/`frontend-main-*` (Git e Docker) rimasti da eventuali tentativi precedenti su `main` mai
   promossi — mantenendo sempre il più recente per scope, così il prossimo diff di `Build & Deploy` ha ancora
   una baseline da cui partire. Se è stato promosso **un solo** scope, il trigger passa anche `scope=<quello>`
   — l'altro scope non è cambiato, non c'è motivo di ripulirlo in questa run; se sono stati promossi
   entrambi, `scope` resta vuoto (pulisce entrambi). Se nessuno scope è stato promosso (tutto già allineato), questo step non gira:
   non c'è nessuna nuova baseline da preservare.

**Nota sul tag di data e i limiti di GHCR**: il tag di data **non** viene eliminato dall'immagine appena
promossa nello step 4. L'API di GitHub Packages cancella per *versione* (= digest), non per singolo tag:
poiché il tag di versione reale appena creato punta allo stesso digest del tag di data, cancellare quella
versione rimuoverebbe anche il tag reale appena assegnato — sia `cleanup-registry` di `Build & Deploy` sia il
`Cleanup build tags` triggerato dallo step 5 lo sanno e saltano sempre le immagini che hanno anche un tag
`X.Y.Z`.

Per rilasciare una nuova versione di un componente, alza a mano il campo `version` nel `package.json`
corrispondente prima del push su `main`: la pipeline la userà per il tag Git e per il tag Docker al momento
della promozione.

#### `Deploy Backend` / `Deploy Frontend` / `Deploy Authorizer` ([deploy-backend.yml](.github/workflows/deploy-backend.yml) / [deploy-frontend.yml](.github/workflows/deploy-frontend.yml) / [deploy-authorizer.yml](.github/workflows/deploy-authorizer.yml))

**Solo `workflow_call`**: non compaiono nella tab Actions come workflow lanciabili direttamente — esistono
solo per essere chiamati da `Build & Deploy` (development) e da `Promote` (club). Prendono in input
`environment` (Environment GitHub da usare) e `image_tag` (tag dell'immagine da deployare — di data o
versione reale, indifferentemente). Ricavano namespace, nomi dei database e cartella sulla VPS dal nome
dell'Environment (action `ambiente`), renderizzano i manifest k8s del proprio scope con `envsubst` leggendo
le Variables/Secrets **dell'Environment ricevuto in input**, li copiano sulla VPS via SSH, li applicano e
verificano il rollout. Nessuna conoscenza di *perché* si sta deployando quel tag né di *chi* li ha chiamati —
un cambiamento a come si deploya (nuovo step, nuovo manifest, nuova secret) si scrive una volta sola e vale
per ogni ambiente.

`Deploy Frontend` genera inoltre con `jq` la configurazione del club — nome, indirizzi di API e
authorizer, colori e logo — e la mette nel ConfigMap del frontend, da cui nginx la serve su
`/config.json`. Si ferma con un errore chiaro se mancano `APP_DOMAIN`, `AUTH_DOMAIN` o `TENANT_NAME`, o se
`LOGO_FILE` non esiste in `frontend/public/branding/`.

#### `Promote` ([promote.yml](.github/workflows/promote.yml))

**Attivazione manuale**, con input `environment` — l'Environment del club, dal menu a tendina — e
`backend_version`/`frontend_version`/`authorizer_version` (opzionali come stringa, es. `1.4.0` — ma
**almeno uno richiesto**): puoi promuovere un solo componente o più d'uno nella stessa run. La stessa
versione si porta in più club lanciando Promote una volta per club. **Non tagga nulla, non crea Release** —
richiede che la versione indicata sia già stata creata da **Tag** in precedenza.

1. **validate**: rifiuta `development` (lì deploya `Build & Deploy` a ogni push, e una promozione manuale
   ne scavalcherebbe lo stato), poi per ciascuna versione indicata verifica che il tag
   `server-v<versione>`/`client-v<versione>`/`auth-v<versione>` esista davvero nel repo — altrimenti
   fallisce subito con un `::error::` esplicito, invece di procedere con un'immagine inesistente/sbagliata.
2. **deploy-backend** / **deploy-frontend** / **deploy-authorizer** (a seconda degli input valorizzati):
   chiamano i workflow riutilizzabili con l'ambiente scelto e il tag di versione validato — stesso identico
   workflow di deploy usato da `Build & Deploy` per lo sviluppo, nessuna logica duplicata.

Sicuro da rilanciare più volte con lo stesso input (es. per riallineare un club dopo un incidente):
non essendoci alcuno stato/tag da spostare, non ha effetti collaterali oltre al deploy stesso.

### Struttura dei manifest k8s

I manifest di backend/frontend sono **colocati nel folder del componente a cui appartengono**
(`backend/k8s/`, `frontend/k8s/`), non più in un `k8s/templates/app/` condiviso: così un cambio ai manifest
di un componente ricade sotto lo stesso prefisso di path (`backend/`/`frontend/`) usato da `Build & Deploy`
per decidere cosa buildare/deployare (vedi sopra), senza bisogno di regole separate per "solo k8s".
`k8s/templates/infra/` (usato solo da **Infra**: namespace e Postgres) resta invece centralizzato, dato
che non appartiene a nessuno dei tre moduli.

```
backend/
├── k8s/                     # manifest con placeholder ${VAR}, applicati da deploy-backend
│   ├── configmap.yaml        # variabili non sensibili (DB_*, AUTH_ISSUER, AUTH_INTERNAL_URL, ...)
│   ├── secret.yaml           # DB_PASSWORD
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml           # possiede la richiesta TLS/cert-manager (ClusterIssuer "letsencrypt")
│                               # per l'host condiviso col frontend
└── ...                       # codice del backend

authorizer/
├── k8s/                     # manifest con placeholder ${VAR}, applicati da deploy-authorizer
│   ├── configmap.yaml        # DB_*, AUTH_ISSUER, CORS_ORIGIN, PORT
│   ├── secret.yaml           # AUTH_DB_PASSWORD, chiave di firma, admin iniziale
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml           # host proprio (AUTH_DOMAIN), certificato TLS separato
└── ...                       # codice dell'authorizer

frontend/
├── k8s/                     # manifest con placeholder ${VAR}, applicati da deploy-frontend
│   ├── configmap.yaml        # /version.json e /config.json del club, serviti da nginx
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml           # stesso host/secretName TLS del backend, SENZA annotazione cert-manager
│                               # (una sola Certificate per host, gestita dall'Ingress del backend)
└── ...                       # codice del frontend

k8s/
└── templates/infra/          # applicati da Infra (i due namespace e l'istanza Postgres)
    ├── namespace.yaml            # namespace applicativo (clubby-<env>-app)
    ├── postgres-namespace.yaml   # namespace dell'istanza Postgres (DB_NAMESPACE)
    ├── postgres-pvc.yaml         # questo e il seguente: applicati solo se l'istanza non esiste
    ├── postgres-deployment.yaml
    ├── postgres-service.yaml
    └── postgres-nodeport.yaml    # opzionale, solo se DB_NODE_PORT è impostata
```

### Variabili e secret da configurare su GitHub

**Per Environment** (Repository → Settings → Environments), non a livello di repository: uno per
`development` e uno per ogni club, ciascuno con i propri "Environment secrets"/"Environment variables".
`Build & Deploy` e `Tag` leggono sempre l'Environment `development`; `Infra` e `Promote` quello scelto al
lancio. Le tabelle sotto vanno quindi configurate **per ogni Environment**, con i valori di quell'ambiente
(hostname, credenziali, nome del club). Le **Secrets** sono cifrate e mai visibili nei log; le **Variables**
sono in chiaro, per valori non sensibili.

Il **nome dell'Environment** conta: da lì derivano namespace, nomi dei database e cartelle sulla VPS (vedi
[Multi-tenant](#multi-tenant)), che quindi non si configurano.

La colonna "Usato da" indica chi li legge; "deploy" = i workflow di deploy, chiamati da **Build & Deploy**
per `development` e da **Promote** per i club. Quelli obbligatori vengono controllati all'inizio di ogni
workflow, che si ferma con l'elenco di ciò che manca. `DB_PASSWORD`, `AUTH_DB_PASSWORD`,
`AUTH_JWT_PRIVATE_KEY` e `INITIAL_ADMIN_PASSWORD` **non vanno inventati a mano**: la prima volta Infra li
genera e li stampa nel riepilogo della sua run (vedi [Infra](#infra), anche se la run fallisce dopo
averli generati) — copiali nell'Environment corrispondente subito dopo.

**Importante**: se questi Secrets sono già presenti sull'Environment quando rilanci Infra, vengono
**riusati così come sono** invece di rigenerarne di nuovi. Una chiave di firma rigenerata invaliderebbe di
colpo tutti i token e i refresh token in circolazione, disconnettendo ogni utente. Le password dei
database vengono invece riallineate sugli utenti Postgres a ogni run di Infra.

#### Secrets

| Nome | Descrizione | Esempio | Usato da |
|------|-------------|---------|----------|
| `SSH_PRIVATE_KEY` | Chiave privata SSH (PEM) corrispondente a una chiave pubblica autorizzata sulla VPS | `-----BEGIN OPENSSH PRIVATE KEY-----...` | Infra, deploy |
| `GHCR_PAT` | Personal Access Token GitHub con scope `read:packages`, usato per creare nel namespace dell'app il Secret k8s `ghcr-secret` (`imagePullSecrets` di backend, frontend e authorizer) — i package su `ghcr.io` sono privati di default, senza questo token i pod restano in `ImagePullBackOff`. **Non generato da Infra**, **non riusare il `GITHUB_TOKEN` automatico**: è valido solo per la durata della run, i pod devono poter fare pull in qualunque momento futuro. Genera il token da GitHub → Settings (personali) → Developer settings → Personal access tokens → Tokens (classic) → scope `read:packages` | *(token generato a mano, es. `ghp_xxxxxxxxxxxx`)* | deploy |
| `DB_PASSWORD` | Password dell'utente Postgres `<env>-clubby` — **generata/riusata da Infra**, non a mano | *(copiata dal riepilogo della run Infra)* | Infra, deploy del backend |
| `AUTH_DB_PASSWORD` | Password dell'utente Postgres `<env>-auth` — **generata/riusata da Infra**, non a mano | *(copiata dal riepilogo della run Infra)* | Infra, deploy dell'authorizer |
| `AUTH_JWT_PRIVATE_KEY` | Chiave privata RSA (PEM, a capo come `\n` letterali) con cui l'authorizer firma i token — **generata/riusata da Infra**. Cambiarla invalida tutti i token e i refresh token esistenti | *(copiata dal riepilogo della run Infra)* | Infra, deploy dell'authorizer |
| `INITIAL_ADMIN_PASSWORD` | Password temporanea del primo amministratore — **generata/riusata da Infra**, non scelta a mano: va comunque sostituita al primo accesso. Usata dall'authorizer solo se il database degli account è vuoto, ma il deploy la richiede sempre | *(copiata dal riepilogo della run Infra)* | Infra, deploy dell'authorizer |
| `WORKFLOW_PAT` | **Secret di repository, non per Environment** (unico in questa tabella). Personal Access Token con permesso "Workflows: Read and write" (scope `workflow` sui token classic). Serve perché Tag tagga un commit "vecchio" — l'ultimo `<scope>-main-*` deployato, non la punta attuale di `main` — e il `GITHUB_TOKEN` di default rifiuta il push di un tag quando il contenuto di `.github/workflows/` in quel commit non è identico a quello dell'ultimo commit di un branch, condizione quasi certa una volta che i workflow evolvono. **Non riusare `GHCR_PAT`**: quello finisce in un Secret k8s persistito sul cluster, e dargli anche scope `workflow` permetterebbe di modificare le pipeline CI/CD a chiunque legga quel Secret | *(token generato a mano, es. `ghp_xxxxxxxxxxxx`)* | Tag |

#### Variables

##### Obbligatorie (nessun default: vanno impostate per ogni Environment)

| Nome | Descrizione | Esempio | Usata da |
|------|-------------|---------|----------|
| `SSH_HOST` | Indirizzo della VPS su cui gira il cluster k8s | `203.0.113.10` | Infra, deploy |
| `SSH_USER` | Utente SSH per connettersi alla VPS | `deploy` | Infra, deploy |
| `DB_NAMESPACE` | Namespace dell'istanza Postgres da usare. Più club possono indicare lo stesso e condividerla; se l'istanza non esiste la crea Infra. Da questo valore le pipeline ricavano anche l'indirizzo del database | `postgres-prod` | Infra, deploy di backend e authorizer |
| `APP_DOMAIN` | Hostname pubblico dell'app (Ingress di frontend **e** backend sullo stesso host, routing per path: `/api` → backend, `/` → frontend; anche base dell'indirizzo delle API in `/config.json`) | `romaasd.clubby.example.com` | deploy |
| `AUTH_DOMAIN` | Hostname pubblico dell'authorizer (bare host). Il browser vi accede direttamente, e questo valore diventa l'issuer dei token (`https://` + questo valore): il backend lo confronta esattamente col claim `iss`, quindi un valore sbagliato fa fallire ogni verifica | `auth.romaasd.clubby.example.com` | deploy |
| `TENANT_NAME` | Nome del club mostrato nell'app, servito al browser in `/config.json` | `ASD Roma` | deploy del frontend |
| `INITIAL_ADMIN_EMAIL` | Email del primo amministratore, creato dall'authorizer solo se il database degli account è vuoto. Va impostata prima di lanciare Infra, che la verifica e la riporta nel riepilogo accanto alla password temporanea generata | `admin@tuodominio.it` | Infra, deploy dell'authorizer |

##### Opzionali (default applicato se non impostate)

| Nome | Descrizione | Esempio | Default | Usata da |
|------|-------------|---------|---------|----------|
| `SSH_PORT` | Porta SSH della VPS | `22` | `22` | Infra, deploy |
| `BACKEND_PORT` | Porta interna su cui ascolta il backend (Deployment + ConfigMap `PORT`) | `3000` | `3000` | deploy del backend |
| `AUTH_PORT` | Porta interna su cui ascolta l'authorizer (Deployment + ConfigMap `PORT`) | `3001` | `3001` | deploy dell'authorizer |
| `POSTGRES_STORAGE_SIZE` | Dimensione del PVC dell'istanza Postgres. Usata **solo quando Infra crea l'istanza**: su un'istanza esistente, condivisa con altri club, non viene riapplicata | `5Gi` | `5Gi` | Infra |
| `DB_PORT` | Porta Postgres | `5432` | `5432` | deploy di backend e authorizer |
| `DB_NODE_PORT` | Porta `NodePort` su cui esporre l'istanza Postgres sull'IP pubblico della VPS, per collegarsi da un client locale (DBeaver, ecc.) — feature opt-in, **nessun default**. Vale per tutta l'istanza, quindi per tutti i club che la condividono, e non viene mai rimossa in automatico (vedi "Connessione al DB da un client locale"). Valori possibili 30000-32767, unici nel cluster | `30432` | `-` (disattivato) | Infra |
| `THEME_PRIMARY` | Colore primario (bottoni, link attivi) | `#FF6B4A` | `#FF6B4A` | deploy del frontend |
| `THEME_PRIMARY_TEXT` | Colore del testo sopra il colore primario | `#ffffff` | `#ffffff` | deploy del frontend |
| `THEME_DANGER` | Colore per importi negativi/azioni distruttive | `#dc2626` | `#dc2626` | deploy del frontend |
| `THEME_SUCCESS` | Colore per importi positivi/conferme | `#16a34a` | `#16a34a` | deploy del frontend |
| `THEME_NAV_BG` | Colore di sfondo della barra di navigazione | `#2E2A26` | `#2E2A26` | deploy del frontend |
| `THEME_NAV_TEXT` | Colore del testo/voci di menu sulla barra di navigazione, da abbinare a `THEME_NAV_BG` per restare leggibile | `#F5C36B` | `#F5C36B` | deploy del frontend |
| `LOGO_FILE` | Nome del file SVG in `frontend/public/branding/` da usare come logo e favicon del club. Il file deve essere nel repository (e quindi nell'immagine): il deploy si ferma se non esiste | `romaasd.svg` | `-` (resta il logo di default) | deploy del frontend |
| `ENABLE_MODULE_TESSERAMENTO` | Attiva il modulo Tesseramento: pagina Tesseramenti, quota nel pannello Admin e API `/api/tesseramenti`. Attivo **solo** con il valore esatto `true` | `true` | `-` (modulo spento) | deploy di backend e frontend |
| `ENABLE_MODULE_FATTURAZIONE` | Attiva il modulo Fatturazione: pagina Fatturazione e API `/api/fatturazione`. Attivo **solo** con il valore esatto `true` | `true` | `-` (modulo spento) | deploy di backend e frontend |

I colori e il logo non richiedono una nuova build: cambiano al successivo deploy del frontend.

Lo stesso vale per i moduli opzionali: si accendono e si spengono cambiando la Variable e rifacendo il
deploy dei due moduli interessati (backend **e** frontend — il backend decide cosa serve, il frontend cosa
mostrare). Il database resta completo in ogni caso: spegnere un modulo non cancella nulla e riaccenderlo
ritrova tutto lo storico.

Nessun secret aggiuntivo serve per il registry immagini: le pipeline si autenticano su `ghcr.io` con il
`GITHUB_TOKEN` automatico di Actions (permesso `packages: write`, già configurato nei workflow).

### Connessione al DB da un client locale (DBeaver, ecc.)

Postgres gira dentro il cluster su un Service `ClusterIP` (solo interno, non raggiungibile da internet).
Due modi per collegarti da un client locale:

#### 1. Tunnel SSH + `kubectl port-forward` (sempre disponibile, nessuna esposizione pubblica)

Da terminale locale:
```bash
ssh -i ~/.ssh/k9_deploy 5432:localhost:5432 deploy@<IP_VPS> \
  'export KUBECONFIG=/home/deploy/.kube/config && kubectl port-forward -n <namespace> svc/postgres 5432:5432'
```
(sostituisci `<IP_VPS>` e `<namespace>` con il `DB_NAMESPACE` dell'istanza, es. `postgres-prod`;
sostituisci `deploy` se il tuo `SSH_USER` è diverso). Lascia il terminale aperto finché usi il client — il
tunnel resta attivo finché la sessione SSH è connessa.

Poi in DBeaver: host `localhost`, porta `5432`, database e utente `<env>-clubby` (o `<env>-auth` per gli
account), password `DB_PASSWORD` (o `AUTH_DB_PASSWORD`) dell'Environment del club. Ogni utente vede solo il
proprio database.

#### 2. `NodePort` (esposizione pubblica sull'IP della VPS, opt-in)

Imposta `DB_NODE_PORT` (es. `30432`) sull'Environment desiderato e rilancia **Infra**: crea un Service
`NodePort` aggiuntivo (`k8s/templates/infra/postgres-nodeport.yaml`), raggiungibile su
`<IP_VPS>:<DB_NODE_PORT>`. Il Service espone l'intera istanza, quindi i database di tutti i club che la
condividono (ciascuno protetto dalla password del proprio utente). Non viene mai rimosso in automatico:
su un'istanza condivisa, un club senza `DB_NODE_PORT` toglierebbe l'accesso configurato da un altro.
Per rimuoverlo:

```bash
kubectl delete service postgres-external -n <DB_NAMESPACE>
```

⚠️ **Attenzione**: un `NodePort` espone Postgres su tutte le interfacce della VPS, protetto solo dalla
password del DB. Se lo attivi, filtra la porta via firewall (es. Hetzner Cloud Firewall) al tuo IP
personale — non lasciarla aperta a tutto internet.

In DBeaver: host `<IP_VPS>` (o un DNS che punta allo stesso IP, es. `db-dev.clubby.click`), porta
`DB_NODE_PORT`, stesse credenziali del metodo 1.

#### 3. Docker

```bash
docker run --rm -it \
  -v "$(pwd)/scripts:/scripts" \
  -e DB_HOST=<IP_VPS> -e DB_PORT=<...> -e DB_PASSWORD=<...> \
  -e AUTH_INTERNAL_URL=https://auth-dev.clubby.click -e AUTH_DB_PASSWORD=<...> \
  postgres:18.3-alpine \
  sh -c "apk add --no-cache bash curl jq && bash /scripts/seed-demo-data.sh"
```

## Package.json script

npm run version -- [frontend|backend] [major|minor|patch]

## TODO

- [ ] Configurare il DNS di `APP_DOMAIN` e `AUTH_DOMAIN` verso l'IP pubblico della VPS
      (necessario perché cert-manager possa risolvere la challenge HTTP-01 ed emettere i certificati)
- [ ] Verificare l'emissione dei certificati partendo dal `ClusterIssuer` `letsencrypt-staging` prima di
      passare a `letsencrypt` (produzione), per non consumare il rate limit reale di Let's Encrypt
- [ ] Lanciare la pipeline **Infra** e copiare i valori generati (`DB_PASSWORD`, `AUTH_DB_PASSWORD`,
      `AUTH_JWT_PRIVATE_KEY`) nei GitHub Secrets prima del primo Build & Deploy
- [ ] Prova pipeline (Build & Deploy, poi Tag)
- [ ] Implementare api Test
- [ ] Definire in dettaglio la strategia di backup di Postgres (CronJob `pg_dump` + storage esterno) —
      include il database degli account, la cui perdita significherebbe rifare tutte le registrazioni
- [ ] Valutare l'invio di email (SMTP): abiliterebbe la verifica dell'indirizzo alla registrazione e il
      reset self-service della password, oggi possibile solo tramite un admin
- [ ] Rotazione della chiave di firma dei token: il formato JWKS con `kid` la supporta già (il `kid`
      deriva dal contenuto della chiave), ma manca la procedura per servire due chiavi durante la
      transizione senza disconnettere tutti

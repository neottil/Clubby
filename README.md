# ClubManager

Applicazione multi-tenant per la gestione di Associazioni Sportive Dilettantistiche (ASD).

## Funzionalità

- Gestione soci
- Gestione incontri
- Buoni prepagati

## Architettura

- **Frontend**: React 19 + Vite + TypeScript
- **Backend**: Node.js 22, server HTTP nativo (`backend/src/server.ts`), usato sia in locale che in produzione
- **Database**: PostgreSQL 16
- **Autenticazione**: Keycloak 26 (OIDC Authorization Code Flow + PKCE)
- **Deploy target**: Docker / Kubernetes su VPC privata (nessuna dipendenza AWS)

## Modello utenti e ruoli

### Ruoli Keycloak

- **admin**: vede e gestisce i dati di tutti i soci. Può promuovere altri utenti ad admin. Viene creato tramite script init.
- **viewer**: vede solo i propri dati (soci, incontri, buoni, movimenti). Viene assegnato automaticamente alla registrazione.

### Registrazione

1. Il socio clicca "Registrati" → viene reindirizzato a Keycloak (standard registration form)
2. Keycloak crea l'utente nel proprio DB
3. Dopo il login il frontend chiama `POST /api/auth/register` con nome e cognome
4. Il backend assegna automaticamente il ruolo `viewer` e crea il record socio nel DB
5. Il socio può ora accedere ai propri dati

### Admin principale

- **In locale**: creato da `scripts/init-local-keycloak.sh` — credenziali: admin@clubmanager.local / Admin1234!
- **In produzione**: creato dalla pipeline [Infra](#infra) (email e password temporanea forniti al lancio del workflow, nessuna credenziale hardcoded).

Un admin può promuovere qualsiasi utente viewer ad admin tramite `POST /api/admin/promuovi`.

## API Endpoints

Tutte le API richiedono un JWT Keycloak valido (Bearer token).

| Metodo | Path | Descrizione | Ruolo richiesto |
|--------|------|-------------|-----------------|
| POST | `/api/auth/register` | Registrazione post-login (crea socio + assegna viewer) | Qualsiasi JWT valido |
| GET | `/api/soci` | Lista soci (admin: tutti, viewer: solo il proprio) | admin / viewer |
| POST | `/api/soci` | Crea socio manualmente | admin |
| GET | `/api/soci/:id` | Dettaglio socio | admin / viewer (solo il proprio) |
| PUT | `/api/soci/:id` | Modifica socio | admin |
| DELETE | `/api/soci/:id` | Elimina socio | admin |
| GET | `/api/incontri` | Lista incontri (admin: tutti, viewer: solo i propri) | admin / viewer |
| POST | `/api/incontri` | Crea incontro | admin |
| GET | `/api/incontri/:id` | Dettaglio incontro | admin / viewer (solo il proprio) |
| PUT | `/api/incontri/:id` | Modifica incontro | admin |
| DELETE | `/api/incontri/:id` | Elimina incontro | admin |
| GET | `/api/buoni` | Lista buoni (admin: tutti, viewer: solo i propri) | admin / viewer |
| POST | `/api/buoni` | Crea buono (un solo buono per socio) | admin |
| GET | `/api/buoni/:id/movimenti` | Movimenti buono | admin / viewer (solo il proprio) |
| POST | `/api/buoni/:id/movimenti` | Aggiungi movimento | admin |
| GET | `/api/admin/users` | Lista utenti Registrati | admin |
| POST | `/api/admin/associa-viewer` | Associa utente a socio (body: socio_id, keycloak_user_id) | admin |
| DELETE | `/api/admin/associa-viewer/:socioId` | Disassocia viewer da socio | admin |
| POST | `/api/admin/promuovi` | Promuovi utente ad admin (body: keycloak_user_id) | admin |

## Sviluppo locale

### Prerequisiti

- Docker + Docker Compose
- Node.js 22+
- npm
- `curl` e `jq` (per init-local-keycloak.sh)

### Avvio

1. Avvia l'infrastruttura locale (PostgreSQL applicativo + PostgreSQL Keycloak + Keycloak):
   ```bash
   docker compose up -d
   ```

2. Attendi che Keycloak sia pronto (circa 60-90 secondi, verificabile con `docker compose logs -f keycloak`), poi inizializza realm e utenti:
   ```bash
   bash scripts/init-local-keycloak.sh
   ```
   Lo script è **interattivo**: per ogni parametro (URL Keycloak, realm, utente/password admin Keycloak,
   URL base API backend, nome tenant) mostra un valore predefinito tra parentesi quadre — premi Invio per
   accettarlo, oppure digita un valore diverso. Va eseguito una sola volta dopo l'avvio dei container (o dopo
   un reset dei volumi). Crea il realm `clubmanager`, i client, i ruoli e gli utenti di test, e scrive
   automaticamente `backend/.env` e `frontend/.env.local`.

3. Installa le dipendenze di backend e frontend:
   ```bash
   npm run install:all
   ```

4. Avvia backend e frontend insieme:
   ```bash
   npm run dev
   ```
   In alternativa, per avviarli separatamente (es. in due terminali distinti): `npm run dev:backend` e `npm run dev:frontend`.

5. Apri http://localhost:5173

### Gestione container

| Comando | Descrizione |
|---------|-------------|
| `docker compose up -d` | Avvia Postgres + Keycloak in background |
| `docker compose down` | Ferma i container |
| `docker compose down -v` | Reset completo (cancella anche i volumi/dati) |
| `docker compose logs -f keycloak` | Log Keycloak |
| `docker compose logs -f postgres` | Log PostgreSQL |

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

| Utente | Password | Ruolo |
|--------|----------|-------|
| admin@clubmanager.local | Admin1234! | admin |
| viewer@clubmanager.local | Viewer1234! | viewer |

### Keycloak Admin UI

http://localhost:8080 → admin / admin

## Struttura progetto

```
ClubManager/
├── .github/
│   └── workflows/
│       ├── infra.yml        # Provisiona namespace + Postgres condiviso + Keycloak (manuale)
│       ├── build-deploy.yml # Build immagini + deploy k8s (be/fe) via SSH
│       └── tag.yml          # Crea/sposta i tag server-v*, client-v*, k8s-v* (manuale)
├── backend/
│   ├── src/
│   │   ├── handlers/       # Handler HTTP (soci, incontri, buoni, admin, auth)
│   │   ├── service/        # Business logic
│   │   ├── middleware/      # Auth (Keycloak JWT), response helpers, error classes
│   │   ├── db/             # Database client (pg Pool) + schema SQL
│   │   └── server.ts       # Entry point HTTP (locale e produzione)
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── auth/           # AuthContext (Keycloak OIDC + PKCE)
│   │   ├── api/            # API client factory
│   │   ├── pages/          # SociPage, IncontriPage, BuoniPage, AdminPage, LoginPage
│   │   ├── components/     # Layout
│   │   └── config.ts       # Runtime config (Keycloak URL, realm, client ID)
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── k8s/
│   ├── package.json        # Version dei manifest, usata dalla pipeline per il tag k8s-v*
│   └── templates/          # Manifest con placeholder ${VAR}, renderizzati in CI
│       ├── app/            # Gestiti da Build & Deploy: backend, frontend, ingress
│       └── infra/          # Gestiti da Infra: namespace, Postgres condiviso, Keycloak
├── scripts/
│   ├── init-local-keycloak.sh         # Setup Keycloak locale (interattivo, Docker Compose)
│   ├── keycloak-realm-init.sh   # Init realm Keycloak in k8s (non interattivo, eseguito da Infra)
│   └── setup-vps-k3s.sh         # Setup k3s + Traefik + cert-manager/Let's Encrypt sulla VPS
├── docker-compose.yml
└── package.json            # Script "dev" per avviare backend + frontend insieme
```

## Multi-tenant

Ogni tenant (ASD) ha un ambiente interamente separato: proprio namespace Kubernetes, proprio deploy
(backend + frontend), proprio database PostgreSQL e proprio realm Keycloak. L'isolamento è quindi a
livello di infrastruttura/deploy, non applicativo: non esiste un meccanismo di `tenant_id` condiviso
all'interno di un singolo database o realm.

Configurazione del tenant tramite variabili d'ambiente:
- `VITE_TENANT_NAME`: nome visualizzato del tenant (es. "ASD Roma")
- Ogni tenant ha il proprio realm Keycloak, database e deploy (nel proprio namespace Kubernetes)

## Deploy (VPC / Kubernetes)

- **Keycloak**: `KC_PROXY=edge` se dietro load balancer HTTPS, `KC_HOSTNAME=https://auth.tuodominio.com`
- **Backend**: variabile d'ambiente `DB_HOST` punta al servizio Postgres nel cluster
- **JWT verification**: il backend verifica il token JWT via JWKS di Keycloak (ingress opzionale)
- **Secrets**: usare il secret manager del provider cloud scelto
- **Database**: PostgreSQL 16 gestito (RDS, Cloud SQL, o self-hosted)
- Nessuna dipendenza AWS di nessun tipo

### Variabili d'ambiente

Vedi la tabella completa in [Variabili e secret da configurare su GitHub](#variabili-e-secret-da-configurare-su-github).

## K8s

### Scelte fatte

- **Database**: PostgreSQL self-hosted come **istanza unica condivisa** tra app e Keycloak (due database
  separati sullo stesso pod: `${DB_NAME}` e `keycloak`), non un SaaS esterno tipo Neon/Supabase né un
  operator come CloudNativePG. Motivazione: Keycloak richiede comunque un DB relazionale nel cluster (non
  supporta MongoDB); condividere una sola istanza invece di due separate risparmia risorse su una VPS
  piccola con mole di dati ridotta (piccola ASD) — non serve HA multi-replica né un operator dedicato in
  questa fase. Contrappeso accettato: un problema al pod Postgres impatta sia l'app che l'autenticazione.
- **Persistenza**: un solo PersistentVolumeClaim (PVC) per l'istanza Postgres condivisa.
- **Backup**: CronJob Kubernetes che esegue `pg_dump` periodico verso storage esterno (es. bucket
  S3-compatible self-hosted, no AWS). Da definire in dettaglio in fase di implementazione.
- **Multi-tenant**: un namespace Kubernetes per tenant, ciascuno con i propri pod (backend, frontend,
  Postgres, Keycloak) e i propri Secret — coerente con quanto descritto in [Multi-tenant](#multi-tenant).

**Stato attuale**: due pipeline distinte, scope separato (vedi [Pipeline CI/CD](#pipeline-cicd-github-actions)):
**Infra** provisiona namespace, Postgres condiviso e Keycloak (una tantum, o quando serve ricreare
l'infrastruttura); **Build & Deploy** gestisce solo backend e frontend applicativi, assumendo che
l'infrastruttura di base esista già nel namespace.

### Setup iniziale del cluster (VPS)

**Nessuna pipeline esegue questo passaggio: va lanciato a mano, una volta sola**, sulla VPS di produzione,
prima di qualsiasi altra pipeline (Infra compresa). È un bootstrap a livello di host (installa k3s stesso),
diverso dai Job che girano *dentro* un cluster già esistente (come `keycloak-realm-init.sh`, eseguito da un
Job Kubernetes orchestrato dalla pipeline Infra — vedi sotto): qui il cluster non esiste ancora, quindi non
c'è modo di farlo girare "come Job", e richiede accesso root diretto alla VPS:

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
     [k8s/templates/app/ingress.yaml](k8s/templates/app/ingress.yaml) e
     [k8s/templates/infra/keycloak-ingress.yaml](k8s/templates/infra/keycloak-ingress.yaml)

Entrambi risolvono la ACME challenge **HTTP-01** tramite Traefik (`ingressClassName: traefik`).

**I certificati si rinnovano automaticamente, nessuna azione manuale richiesta.** cert-manager tiene traccia
della scadenza di ogni certificato (i certificati Let's Encrypt durano 90 giorni) e ne richiede uno nuovo
in automatico circa 2/3 della validità prima della scadenza (quindi tipicamente intorno al giorno ~60),
aggiornando il Secret TLS referenziato dall'Ingress senza downtime. L'unica condizione è che cert-manager
resti in esecuzione nel cluster e che l'host risolva ancora pubblicamente verso la VPS (challenge HTTP-01).

Dopo lo script, il passo successivo è lanciare la pipeline **[Infra](#infra)** (una
tantum per namespace) per creare namespace, Postgres e Keycloak — solo dopo, **Build & Deploy** può
funzionare.

### Struttura architetturale per namespace (per tenant)

```
namespace-<tenant>/
├── Deployment  backend        (immagine clubmanager-backend, legge Secret/ConfigMap per DB/Keycloak) [build-deploy]
├── Deployment  frontend       (immagine clubmanager-frontend, statica dietro Ingress)                [build-deploy]
├── Deployment  keycloak       (immagine Keycloak ufficiale)                                          [infra]
├── Deployment  postgres       (istanza condivisa app+Keycloak, con PVC)                               [infra]
├── Job         keycloak-realm-init (one-shot: crea realm/client/ruoli/primo admin)                    [infra]
├── Service     backend, frontend                                                                      [build-deploy]
├── Service     keycloak, postgres                                                                     [infra]
├── Ingress     clubmanager (routing verso frontend/backend, TLS)                                       [build-deploy]
├── Ingress     clubmanager-keycloak (routing verso Keycloak, TLS)                                      [infra]
├── Secret      clubmanager-secrets (DB_PASSWORD, KEYCLOAK_ADMIN_CLIENT_SECRET, per backend)            [build-deploy]
├── Secret      clubmanager-infra-secrets (DB_PASSWORD, KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD)              [infra]
└── ConfigMap   clubmanager-config (DB_HOST/PORT/NAME/USER, KEYCLOAK_URL/REALM/CLIENT_ID, PORT)         [build-deploy]
```

`[build-deploy]` = generato/applicato automaticamente dal workflow **Build & Deploy** (backend/frontend).
`[infra]` = generato/applicato automaticamente dal workflow **Infra** (namespace, Postgres, Keycloak) — va
lanciato prima, una tantum per namespace.

### Pipeline CI/CD (GitHub Actions)

Tre workflow in [.github/workflows](.github/workflows), scope separato: **Infra** provisiona una tantum
namespace/Postgres/Keycloak, **Build & Deploy** builda e deploya solo backend e frontend a ogni push,
**Tag** promuove manualmente un deploy a "versione reale".

#### Infra

Workflow: [infra.yml](.github/workflows/infra.yml).

**Attivazione manuale** (`workflow_dispatch`, con due input obbligatori: email e password temporanea del
primo admin). Da lanciare una tantum per namespace, prima del primo `Build & Deploy`, o quando serve
ricreare l'infrastruttura di base. **Presuppone che `scripts/setup-vps-k3s.sh` sia già stato eseguito a
mano sulla VPS** (k3s, Traefik e cert-manager devono esistere): questa pipeline parte da un cluster già
funzionante, non lo crea. È idempotente (`kubectl apply`/`--dry-run=client -o yaml | kubectl apply -f -`
ovunque), quindi rieseguibile senza distruggere dati esistenti.

1. Genera tre valori casuali (`openssl rand`): `DB_PASSWORD`, la password bootstrap dell'admin console di
   Keycloak, e `KEYCLOAK_ADMIN_CLIENT_SECRET` — mai committati, esistono solo per la durata della run.
2. Renderizza i template [k8s/templates/infra](k8s/templates/infra) con `envsubst` e li copia sulla VPS via
   SSH, insieme allo schema SQL dell'app ([backend/src/db/schema.sql](backend/src/db/schema.sql)) e allo
   script [scripts/keycloak-realm-init.sh](scripts/keycloak-realm-init.sh).
3. Via SSH: crea il namespace, un Secret con le credenziali generate, un ConfigMap con gli script SQL di
   init Postgres (`CREATE DATABASE keycloak;` + lo schema applicativo, eseguiti automaticamente da Postgres
   al primo avvio via `/docker-entrypoint-initdb.d`), applica Postgres e attende che sia pronto.
4. Applica Keycloak (Deployment + Service + Ingress) e attende che sia pronto.
5. Applica un **Job Kubernetes** one-shot che esegue `keycloak-realm-init.sh` **dentro il cluster** (non via
   SSH dall'host della VPS): il Job gira come pod, quindi risolve il DNS interno (`*.svc.cluster.local`)
   senza bisogno di port-forward o tunnel. Crea il realm, i client (SPA pubblico + backend confidential), i
   ruoli `admin`/`viewer` e **un solo utente admin reale** (non credenziali di test hardcoded), con password
   temporanea che Keycloak obbliga a cambiare al primo login.
6. Stampa nel riepilogo della run (`GITHUB_STEP_SUMMARY`) i valori da copiare a mano nei GitHub
   Secrets/Variables di **Build & Deploy** (`DB_PASSWORD`, `KEYCLOAK_ADMIN_CLIENT_SECRET`, `KEYCLOAK_URL`,
   ecc.) — **visibili in chiaro una sola volta**, non vengono salvati altrove: copiali subito.

**Nota sull'URL di Keycloak**: `KEYCLOAK_URL` (letto dal backend) e `VITE_KEYCLOAK_URL` (compilato nel
frontend) devono puntare allo **stesso URL pubblico HTTPS** (es. `https://auth.tuodominio.com`), non a un
indirizzo interno del cluster. Il backend valida il claim `iss` del JWT confrontandolo esattamente con la
sua `KEYCLOAK_URL` ([backend/src/middleware/auth.ts](backend/src/middleware/auth.ts)); poiché Keycloak
emette token con issuer pari all'URL pubblico usato dal browser (`KC_HOSTNAME`, impostato dal template
[keycloak-deployment.yaml](k8s/templates/infra/keycloak-deployment.yaml)), un `KEYCLOAK_URL` diverso lato
backend farebbe fallire sempre la verifica.

#### `Build & Deploy` ([build-deploy.yml](.github/workflows/build-deploy.yml))

Si attiva su push su `main`, `feature/**`, `fix/**` (o manualmente). Tutti i branch deployano sullo
**stesso namespace** (`KUBE_NAMESPACE`): non c'è ancora separazione tra ambiente di sviluppo e produzione —
ogni push su uno di questi branch sovrascrive il deploy corrente. La promozione controllata in produzione
(namespace/ambiente separato) è prevista in una pipeline dedicata futura, non ancora implementata.

Job in sequenza:

1. **versions**: legge il campo `version` di `backend/package.json`, `frontend/package.json` e
   `k8s/package.json`, calcola un **tag di data** `yyyymmdd_HHMM` (UTC) univoco per questa run, e crea
   subito un tag Git `build-<data>` sul commit (serve a risalire a quale commit è stato buildato/deployato
   da questa run specifica). Pubblica un artifact `versions` con tutti questi valori — usato dal workflow
   Tag, che li recupera invece di ricalcolarli.
2. **build-backend** / **build-frontend**: la **compilazione avviene qui, nella pipeline** (`npm ci && npm
   run build`), non nel Dockerfile — `backend/Dockerfile` e `frontend/Dockerfile` si limitano a impacchettare
   l'output già compilato (`dist/`) rispettivamente in un'immagine Node runtime e in un'immagine nginx. Le
   variabili `VITE_*` sono passate come variabili d'ambiente allo step `npm run build` del frontend (Vite le
   compila nel bundle statico a build-time). Le immagini vengono pushate su GitHub Container Registry
   (`ghcr.io`) taggate **solo** con il tag di data e con `latest` — il tag di versione reale (`X.Y.Z`) viene
   assegnato in seguito dal workflow Tag, solo dopo un deploy riuscito.
3. **deploy**: sostituisce i placeholder `${VAR}` nei template [k8s/templates/app](k8s/templates/app) con i valori
   reali (`envsubst`), usando come immagini quelle appena pushate col tag di data. Copia i manifest
   renderizzati sulla VPS via SSH (`scp`), poi via SSH esegue `kubectl apply -f` seguito da `kubectl rollout
   status` su backend e frontend — la pipeline fallisce se il rollout non si stabilizza entro il timeout.
4. **cleanup-registry**: dopo un deploy riuscito, ripulisce dal registry le immagini taggate solo con la
   data, mantenendo le **3 più recenti** per repository immagine (`clubmanager-backend`,
   `clubmanager-frontend`). I tag di versione reale (`X.Y.Z`) sono sempre esclusi da questa pulizia.

I manifest renderizzati (`k8s/rendered/`, contengono credenziali in chiaro) non vengono mai committati
(vedi `.gitignore`) e vivono solo per la durata della run della pipeline.

#### `Tag` ([tag.yml](.github/workflows/tag.yml))

**Attivazione manuale** (`workflow_dispatch`, tab Actions → Tag → Run workflow): non parte da solo dopo
`Build & Deploy`. Va lanciato quando si decide di **promuovere** l'ultimo deploy riuscito su `main`,
rendendolo la versione "reale" (rilascio) — coerente col fatto che, per ora, `feature/**` e `fix/**`
deployano sullo stesso namespace di sviluppo di `main` e non rappresentano ancora una produzione separata
(quando ci sarà una pipeline di promozione dedicata, questo workflow verrà rivisto).

Accetta un input opzionale `run_id` (l'ID di una run specifica di `Build & Deploy` da promuovere); se
omesso usa automaticamente l'ultima run di `Build & Deploy` completata con successo **su `main`**. In
entrambi i casi verifica che la run scelta appartenga effettivamente a `main` e si ferma con errore in caso
contrario: non è possibile promuovere per sbaglio una build di `feature/**` o `fix/**`.

Una volta individuata la run, scarica l'artifact `versions` che ha prodotto (non ricalcola nulla) e:

1. **Rimuove** dal repo il tag Git di data `build-<data>` creato da Build & Deploy.
2. **Crea o sposta** (force-update) tre tag Git sul commit effettivamente deployato:

   | Tag | Fonte versione |
   |---|---|
   | `server-vX.Y.Z` | `backend/package.json` → `version` |
   | `client-vX.Y.Z` | `frontend/package.json` → `version` |
   | `k8s-vX.Y.Z` | `k8s/package.json` → `version` |

3. **Assegna il tag di versione reale** (`X.Y.Z`) alle immagini Docker già pushate con il tag di data,
   tramite `docker buildx imagetools create` (nessun rebuild: aggiunge solo un riferimento sullo stesso
   digest già presente sul registry).

**Nota sul tag di data e i limiti di GHCR**: il tag di data **non** viene eliminato dall'immagine in questo
passaggio. L'API di GitHub Packages cancella per *versione* (= digest), non per singolo tag: poiché il tag
di versione reale appena creato punta allo stesso digest del tag di data, cancellare quella versione
rimuoverebbe anche il tag reale appena assegnato. Il tag di data resta quindi come alias secondario
sull'immagine finché non viene rimosso dal job `cleanup-registry` di `Build & Deploy` nei cicli successivi
(che mantiene solo le 3 build più recenti, escludendo sempre i tag di versione reale). Il tag Git di data,
invece, viene rimosso subito (i tag Git non condividono questa limitazione).

Per rilasciare una nuova versione di un componente, alza a mano il campo `version` nel `package.json`
corrispondente prima del push su `main`: la pipeline la userà per il tag Git e per il tag Docker dopo il
deploy.

### Struttura `k8s/`

```
k8s/
├── package.json            # version dei manifest, letta dalla pipeline per il tag k8s-vX.Y.Z
└── templates/               # manifest con placeholder ${VAR}, renderizzati da envsubst in CI
    ├── app/                 # applicati da Build & Deploy (backend/frontend)
    │   ├── configmap.yaml    # variabili non sensibili (DB_HOST, KEYCLOAK_URL, ...)
    │   ├── secret.yaml       # DB_PASSWORD, KEYCLOAK_ADMIN_CLIENT_SECRET (per il backend)
    │   ├── backend-deployment.yaml
    │   ├── backend-service.yaml
    │   ├── frontend-deployment.yaml
    │   ├── frontend-service.yaml
    │   └── ingress.yaml      # assume Ingress Controller + cert-manager (ClusterIssuer "letsencrypt")
    └── infra/                # applicati da Infra (namespace, Postgres condiviso, Keycloak)
        ├── namespace.yaml
        ├── postgres-pvc.yaml
        ├── postgres-deployment.yaml
        ├── postgres-service.yaml
        ├── keycloak-deployment.yaml
        ├── keycloak-service.yaml
        ├── keycloak-ingress.yaml
        └── keycloak-init-job.yaml  # Job one-shot: esegue keycloak-realm-init.sh dentro al cluster
```

### Variabili e secret da configurare su GitHub

Repository → Settings → Secrets and variables → Actions. Le **Secrets** sono cifrate e mai visibili nei
log; le **Variables** sono in chiaro, per valori non sensibili.

Usati sia da **Infra** che da **Build & Deploy** salvo dove indicato. `DB_PASSWORD` e
`KEYCLOAK_ADMIN_CLIENT_SECRET` **non vanno inventati a mano**: sono generati dalla pipeline Infra e
stampati nel riepilogo della sua run (vedi [Infra](#infra)) — vanno solo copiati
qui dopo il primo provisioning del namespace.

#### Secrets

| Nome | Descrizione | Esempio |
|------|-------------|---------|
| `SSH_HOST` | Indirizzo della VPS su cui gira il cluster k8s | `203.0.113.10` |
| `SSH_USER` | Utente SSH per connettersi alla VPS | `deploy` |
| `SSH_PRIVATE_KEY` | Chiave privata SSH (PEM) corrispondente a una chiave pubblica autorizzata sulla VPS | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `DB_PASSWORD` | Password del database Postgres condiviso (app + Keycloak) — **generata da Infra**, non a mano | *(copiata dal riepilogo della run Infra)* |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | Client secret del client confidential `clubmanager-backend` su Keycloak — **generato da Infra** | *(copiata dal riepilogo della run Infra)* |

#### Variables

| Nome | Descrizione | Esempio / Default | Usata da |
|------|-------------|--------------------|----------|
| `SSH_PORT` | Porta SSH della VPS | `22` | Infra, Build & Deploy |
| `DEPLOY_PATH` | Percorso remoto sulla VPS dove copiare i manifest di Build & Deploy | `/opt/clubmanager/k8s` | Build & Deploy |
| `INFRA_DEPLOY_PATH` | Percorso remoto sulla VPS dove copiare i manifest di Infra (diverso da `DEPLOY_PATH` per non mischiarli) | `/opt/clubmanager/infra` | Infra |
| `KUBE_NAMESPACE` | Namespace Kubernetes target | `clubmanager-prod` | Infra, Build & Deploy |
| `BACKEND_PORT` | Porta interna su cui ascolta il backend (Deployment + ConfigMap `PORT`) | `3000` | Build & Deploy |
| `POSTGRES_STORAGE_SIZE` | Dimensione del PVC per l'istanza Postgres condivisa | `5Gi` | Infra |
| `DB_HOST` | Host del Postgres condiviso raggiungibile dal cluster (nome del Service creato da Infra) | `clubmanager-postgres.clubmanager-prod.svc.cluster.local` | Build & Deploy |
| `DB_PORT` | Porta Postgres | `5432` | Build & Deploy |
| `DB_NAME` | Nome del database applicativo (il database `keycloak` è fisso, creato da Infra) | `clubmanager` | Infra, Build & Deploy |
| `DB_USER` | Utente Postgres applicativo (condiviso anche da Keycloak) | `clubmanager` | Infra, Build & Deploy |
| `KEYCLOAK_HOST` | Hostname pubblico di Keycloak (bare host, usato nell'Ingress di Infra) | `auth.clubmanager.example.com` | Infra |
| `KEYCLOAK_BOOTSTRAP_ADMIN` | Username dell'admin console Keycloak (bootstrap, non l'admin applicativo) | `admin` | Infra |
| `KEYCLOAK_URL` | URL **pubblico** di Keycloak — deve coincidere con `VITE_KEYCLOAK_URL` (vedi nota sull'issuer JWT sopra), non punta al DNS interno del cluster | `https://auth.clubmanager.example.com` | Build & Deploy |
| `KEYCLOAK_REALM` | Realm Keycloak del tenant | `clubmanager` | Infra, Build & Deploy |
| `KEYCLOAK_ADMIN_CLIENT_ID` | Client ID del client confidential backend | `clubmanager-backend` | Build & Deploy |
| `FRONTEND_HOST` | Hostname pubblico del frontend (usato nell'Ingress, e come base per i redirect URI SPA creati da Infra) | `app.clubmanager.example.com` | Infra, Build & Deploy |
| `BACKEND_HOST` | Hostname pubblico dell'API (usato nell'Ingress) | `api.clubmanager.example.com` | Build & Deploy |
| `VITE_API_BASE_URL` | URL base delle API, compilato nel bundle frontend a build-time | `https://api.clubmanager.example.com` | Build & Deploy |
| `VITE_KEYCLOAK_URL` | URL pubblico di Keycloak, compilato nel bundle frontend — stesso valore di `KEYCLOAK_URL` | `https://auth.clubmanager.example.com` | Build & Deploy |
| `VITE_KEYCLOAK_REALM` | Realm Keycloak, compilato nel bundle frontend | `clubmanager` | Build & Deploy |
| `VITE_KEYCLOAK_CLIENT_ID` | Client ID pubblico SPA, compilato nel bundle frontend | `clubmanager-spa` | Build & Deploy |
| `VITE_TENANT_NAME` | Nome tenant visualizzato in UI, compilato nel bundle frontend | `ASD Roma` | Build & Deploy |
| `VITE_ACTIVITY_SELECT_VALUES_MAPPING` | Mapping JSON attività→costo di default per il form "Nuovo incontro" (opzionale: se assente la select attività è vuota), compilato nel bundle frontend | `{"Dog Dance":20,"Mantrailing":20,"K9 Cross Training":25,"Educazione singolo":20,"Passeggiata":25,"Piscina":25}` | Build & Deploy |
| `VITE_THEME_PRIMARY` | Colore primario (bottoni, link attivi) — opzionale, default il blu attuale | `#2563eb` | Build & Deploy |
| `VITE_THEME_PRIMARY_TEXT` | Colore del testo sopra il colore primario — opzionale | `#ffffff` | Build & Deploy |
| `VITE_THEME_DANGER` | Colore per importi negativi/azioni distruttive — opzionale | `#dc2626` | Build & Deploy |
| `VITE_THEME_SUCCESS` | Colore per importi positivi/conferme — opzionale | `#16a34a` | Build & Deploy |
| `VITE_THEME_NAV_BG` | Colore di sfondo della barra di navigazione — opzionale | `#1a1a2e` | Build & Deploy |
| `VITE_THEME_NAV_TEXT` | Colore del testo/voci di menu sulla barra di navigazione — opzionale, da abbinare a `VITE_THEME_NAV_BG` per restare leggibile | `#c0c0d0` | Build & Deploy |
| `LOGO_FILE` | Nome del file SVG in `frontend/branding/` da usare come logo/favicon del tenant (opzionale: se assente resta il logo di default). **Non** ha prefisso `VITE_*`: non è letta dal browser ma da `scripts/apply-logo.mjs`, eseguito automaticamente da npm come hook `prebuild` prima di `vite build` | `asd1.svg` | Build & Deploy |

Nessun secret aggiuntivo serve per il registry immagini: le pipeline si autenticano su `ghcr.io` con il
`GITHUB_TOKEN` automatico di Actions (permesso `packages: write`, già configurato nei workflow).

## TODO

- [ ] Provare l'app in locale
- [ ] Push (senza workflow)
- [ ] Configurazione variabili e secret per la pipeline (GitHub) — inclusi i nuovi valori richiesti da Infra
      (`INFRA_DEPLOY_PATH`, `POSTGRES_STORAGE_SIZE`, `KEYCLOAK_HOST`, `KEYCLOAK_BOOTSTRAP_ADMIN`)
- [ ] Configurazione ambiente VPS (`scripts/setup-vps-k3s.sh`: k3s, Traefik, cert-manager/Let's Encrypt)
- [ ] Configurare il DNS di `FRONTEND_HOST`/`BACKEND_HOST`/`KEYCLOAK_HOST` verso l'IP pubblico della VPS
      (necessario perché cert-manager possa risolvere la challenge HTTP-01 ed emettere i certificati)
- [ ] Verificare l'emissione dei certificati partendo dal `ClusterIssuer` `letsencrypt-staging` prima di
      passare a `letsencrypt` (produzione), per non consumare il rate limit reale di Let's Encrypt
- [ ] Push workflow
- [ ] Lanciare la pipeline **Infra** e copiare i valori generati (`DB_PASSWORD`,
      `KEYCLOAK_ADMIN_CLIENT_SECRET`, ecc.) nei GitHub Secrets/Variables prima del primo Build & Deploy
- [ ] Prova pipeline (Build & Deploy, poi Tag)
- [ ] Test
- [ ] Definire in dettaglio la strategia di backup di Postgres (CronJob `pg_dump` + storage esterno)
- [ ] Hardening Keycloak in produzione: passare da `start-dev` a `start` (build ottimizzata) — vedi
      [k8s/templates/infra/keycloak-deployment.yaml](k8s/templates/infra/keycloak-deployment.yaml)
- [ ] Pipeline di promozione in produzione (namespace/ambiente separato da quello di sviluppo condiviso da
      `main`/`feature/**`/`fix/**`)

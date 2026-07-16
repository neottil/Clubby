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
- **Deploy target**: Docker / Kubernetes su VPC privata

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
│       ├── infra.yml               # Provisiona namespace + Postgres condiviso + Keycloak (manuale)
│       ├── build-deploy.yml        # Build immagini + deploy k8s (be/fe indipendenti) via SSH
│       ├── tag.yml                 # Crea/sposta i tag server-v*/client-v* (manuale)
│       └── cleanup-build-tags.yml  # Ripulisce i tag <scope>-<branch>-* superati (manuale)
├── backend/
│   ├── src/
│   │   ├── handlers/       # Handler HTTP (soci, incontri, buoni, admin, auth)
│   │   ├── service/        # Business logic
│   │   ├── middleware/      # Auth (Keycloak JWT), response helpers, error classes
│   │   ├── db/             # Database client (pg Pool) + schema SQL
│   │   └── server.ts       # Entry point HTTP (locale e produzione)
│   ├── k8s/                # Manifest con placeholder ${VAR}, applicati da deploy-backend
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
│   ├── k8s/                # Manifest con placeholder ${VAR}, applicati da deploy-frontend
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── k8s/
│   └── templates/infra/    # Manifest ${VAR}, gestiti da Infra: namespace, Postgres condiviso, Keycloak
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
  S3-compatible self-hosted, aws s3). Da definire in dettaglio in fase di implementazione.
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
     [backend/k8s/ingress.yaml](backend/k8s/ingress.yaml) e
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
├── Ingress     clubmanager-backend (path /api, possiede la richiesta TLS/cert-manager)                 [build-deploy]
├── Ingress     clubmanager-frontend (path /, stesso host/secretName TLS del backend)                   [build-deploy]
├── Ingress     clubmanager-keycloak (routing verso Keycloak, TLS)                                      [infra]
├── Secret      clubmanager-secrets (DB_PASSWORD, KEYCLOAK_ADMIN_CLIENT_SECRET, per backend)            [build-deploy]
├── Secret      clubmanager-infra-secrets (DB_PASSWORD, KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD)              [infra]
├── Secret      ghcr-secret (imagePullSecrets: pull immagini private da ghcr.io)                        [build-deploy]
└── ConfigMap   clubmanager-config (DB_HOST/PORT/NAME/USER, KEYCLOAK_URL/REALM/CLIENT_ID, PORT)         [build-deploy]
```

`[build-deploy]` = generato/applicato automaticamente dal workflow **Build & Deploy** (backend/frontend).
`[infra]` = generato/applicato automaticamente dal workflow **Infra** (namespace, Postgres, Keycloak) — va
lanciato prima, una tantum per namespace.

### Pipeline CI/CD (GitHub Actions)

Tre workflow in [.github/workflows](.github/workflows), scope separato: **Infra** provisiona una tantum
namespace/Postgres/Keycloak, **Build & Deploy** builda e deploya solo backend e frontend a ogni push,
**Tag** promuove manualmente un deploy a "versione reale".

**GitHub Environments (`dev`/`prod`)**: `Build & Deploy` e `Tag` sono agganciati (job-level `environment:
dev`) sempre e solo all'Environment `dev` del repo — ogni push builda/deploya sempre in sviluppo, mai in
produzione. `Infra` invece accetta un input obbligatorio `env` (di tipo `environment`: il menu a tendina in
GitHub mostra gli Environment realmente configurati sul repo) e aggancia il job all'Environment scelto
(`environment: ${{ inputs.env }}`), perché va lanciato manualmente una tantum sia per provisionare `dev` che
`prod`. Le **Variables/Secrets** vanno quindi configurate per-Environment (Settings → Environments → `dev` /
`prod`, non più solo a livello di repository): ogni Environment ha i propri valori di
`KUBE_NAMESPACE`/`APP_DOMAIN`/`KEYCLOAK_HOST`/`DB_*`/`SSH_*`/ecc. Una pipeline `Promote` futura userà le
immagini Docker già pushate su `ghcr.io` da `Build & Deploy` (già taggate per data e per versione reale) per
promuoverle da `dev` a `prod` senza rebuild.

#### Infra

Workflow: [infra.yml](.github/workflows/infra.yml).

**Attivazione manuale** (`workflow_dispatch`, con tre input obbligatori: `env` — l'Environment GitHub target,
`dev` o `prod` —, email e password temporanea del primo admin). Aggancia il job all'Environment scelto
(`environment: ${{ inputs.env }}`), quindi legge le Variables/Secrets configurate su **quell'Environment**,
non quelle di `dev` usate da `Build & Deploy`/`Tag`. Da lanciare una tantum per namespace/ambiente, prima del
primo `Build & Deploy` (per `dev`) o prima della prima promozione (per `prod`), o quando serve ricreare
l'infrastruttura di base. **Presuppone che `scripts/setup-vps-k3s.sh` sia già stato eseguito a mano sulla
VPS** (k3s, Traefik e cert-manager devono esistere): questa pipeline parte da un cluster già funzionante, non
lo crea. È idempotente (`kubectl apply`/`--dry-run=client -o yaml | kubectl apply -f -` ovunque), quindi
rieseguibile senza distruggere dati esistenti.

1. Genera tre valori casuali (`openssl rand`): `DB_PASSWORD`, la password bootstrap dell'admin console di
   Keycloak, e `KEYCLOAK_ADMIN_CLIENT_SECRET` — **a meno che non esistano già come Secrets
   sull'Environment**, nel qual caso li riusa invece di rigenerarli (indispensabile per rilanciare Infra in
   sicurezza dopo il primo provisioning, senza disallineare le credenziali da quelle già impostate su
   Postgres/Keycloak). Mai committati, esistono solo per la durata della run se rigenerati.
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
   Secrets/Variables (`DB_PASSWORD`, `KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD`, `KEYCLOAK_ADMIN_CLIENT_SECRET`,
   ecc.) — **visibili in chiaro una sola volta**, non vengono salvati altrove: copiali subito. Questo step
   gira **sempre** (`if: always()`), anche se un passo precedente fallisce (es. il Job di init Keycloak): i
   secret generati/riusati a inizio run vengono comunque mostrati, così puoi copiarli nell'Environment prima
   di rilanciare Infra — che li riuserà invece di generarne di nuovi.

**Nota sull'URL di Keycloak**: `KEYCLOAK_URL` (`https://` + `KEYCLOAK_HOST`, costruito da entrambe le
pipeline, non è una variabile GitHub a sé) deve puntare all'**URL pubblico HTTPS** di Keycloak (es.
`https://auth.tuodominio.com`), non a un indirizzo interno del cluster — il backend valida il claim `iss` del
JWT confrontandolo esattamente con questo valore ([backend/src/middleware/auth.ts](backend/src/middleware/auth.ts));
poiché Keycloak emette token con issuer pari all'URL pubblico usato dal browser (`KC_HOSTNAME`, impostato dal
template [keycloak-deployment.yaml](k8s/templates/infra/keycloak-deployment.yaml)), un `KEYCLOAK_HOST`
sbagliato farebbe fallire sempre la verifica. Il frontend riceve lo stesso valore come `VITE_KEYCLOAK_URL`
(derivato automaticamente nel job `build-frontend`).

#### `Build & Deploy` ([build-deploy.yml](.github/workflows/build-deploy.yml))

Si attiva su push su `main`, `feature/**`, `fix/**` (o manualmente). Tutti i branch deployano sullo
**stesso namespace** (`KUBE_NAMESPACE` dell'Environment `dev`, a cui il workflow è sempre agganciato —
`environment: development` su ogni job): ogni push su uno di questi branch sovrascrive il deploy corrente in
sviluppo. La promozione controllata in produzione (Environment `prod`, provisionato da `Infra`) è prevista in
una pipeline `Promote` dedicata futura, non ancora implementata — riuserà le immagini Docker già pushate su
`ghcr.io` da questo workflow, senza rebuild.

**Backend e frontend sono due scope completamente indipendenti**, ciascuno con i propri manifest k8s
colocati nel proprio folder — `backend/k8s/` e `frontend/k8s/` (niente più un `k8s/templates/app/`
condiviso) — e il proprio tag Git `<scope>-<branch>-<data>` (es. `backend-main-20260716_1317`,
`frontend-feature-login-page-20260716_1317`; `/` nel nome branch diventa `-`). **Un solo tag per scope**,
non due: serve sia da baseline per il diff della run successiva sullo stesso branch, sia da riferimento per
il workflow **Tag** (vedi sotto) — niente più distinzione tra tag "di build" e tag "di deploy".

Job separati (`build-backend`/`deploy-backend` e `build-frontend`/`deploy-frontend`), ciascuno gira **solo**
se serve davvero, e **non tocca mai** il Deployment k8s dell'altro componente se quello non è cambiato
(nessun riavvio/rollout inutile). Il job `versions` diffa `HEAD` contro l'ultimo tag `<scope>-<branch>-*` —
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

**Come avanza il tag `<scope>-<branch>-*`**, sempre a fine job (`deploy-backend`/`deploy-frontend`), solo
dopo un rollout riuscito:
- se c'era un **rebuild**: crea un tag **nuovo** (`<scope>-<branch>-<data-di-questa-run>`), sul commit appena
  deployato — riferisce la nuova immagine appena pushata.
- se era un deploy **manifest-only** (nessun rebuild): **sposta in avanti** (force-update) il tag
  **esistente** più recente di quello scope sul commit di questa run, **senza rinominarlo** — il nome resta
  invariato (quindi continua a riferire correttamente la stessa vecchia immagine, mai spostata), ma il tag
  ora segna "fino a qui il manifest è già stato applicato", cosicché la prossima run non rilevi di nuovo lo
  stesso cambiamento già gestito.

Job:

1. **versions**: legge il campo `version` di `backend/package.json` e `frontend/package.json`, calcola un
   **tag di data** `<branch>-yyyymmdd_HHMM` (UTC) univoco per questa run (usato per le immagini Docker e
   come base del nome dei tag Git di ciascuno scope).
2. **build-backend** / **build-frontend** (condizionali, vedi sopra): la **compilazione avviene qui, nella
   pipeline** (`npm ci && npm run build`), non nel Dockerfile — `backend/Dockerfile` e `frontend/Dockerfile`
   si limitano a impacchettare l'output già compilato (`dist/`) rispettivamente in un'immagine Node runtime e
   in un'immagine nginx. Le variabili `VITE_*` sono passate come variabili d'ambiente allo step `npm run
   build` del frontend (Vite le compila nel bundle statico a build-time). Le immagini vengono pushate su
   GitHub Container Registry (`ghcr.io`) taggate **solo** con il tag di data (branch-scoped) e con `latest` —
   il tag di versione reale (`X.Y.Z`) viene assegnato in seguito dal workflow Tag, solo dopo la promozione.
3. **deploy-backend** (condizionale, vedi sopra): applica **solo** i manifest sotto `backend/k8s/`
   (`configmap.yaml`, `secret.yaml`, `deployment.yaml`, `service.yaml`, `ingress.yaml` — quest'ultimo
   possiede la richiesta TLS/cert-manager per l'host condiviso), poi `kubectl rollout status` sul solo
   Deployment backend.
4. **deploy-frontend** (condizionale, vedi sopra): applica **solo** i manifest sotto `frontend/k8s/`
   (`deployment.yaml`, `service.yaml`, `ingress.yaml` — stesso host/secret TLS di quello del backend, ma
   senza l'annotazione cert-manager, per non farli litigare sulla stessa `Certificate`), poi `kubectl
   rollout status` sul solo Deployment frontend.
5. **cleanup-registry**: dopo almeno un deploy riuscito, ripulisce dal registry le immagini taggate solo con
   la data, mantenendo le **3 più recenti** per repository immagine (`clubmanager-backend`,
   `clubmanager-frontend`), a prescindere dal branch. I tag di versione reale (`X.Y.Z`) sono sempre esclusi
   da questa pulizia.

I manifest renderizzati (`k8s/rendered/`, contengono credenziali in chiaro) non vengono mai committati
(vedi `.gitignore`) e vivono solo per la durata della run della pipeline.

#### `Cleanup build tags` ([cleanup-build-tags.yml](.github/workflows/cleanup-build-tags.yml))

**Attivazione manuale**, oppure **automatica** (fire-and-forget) alla fine di ogni promozione riuscita del
workflow **Tag**, scoped a `branch=main` e `preserve_latest=true`. I tag `<scope>-<branch>-*` **non sono
usa-e-getta**: sono anche la baseline del diff della prossima run di `Build & Deploy` su quel branch e il
riferimento del workflow **Tag** — per questo, di default (`preserve_latest=true`), per ciascuno scope e
per ciascun branch coinvolto viene sempre **mantenuto il tag più recente** (Git e immagine Docker
corrispondente), eliminando solo quelli più vecchi. Così è sicuro lanciarlo — anche in automatico — su un
branch ancora attivo come `main`: dopo la pulizia resta comunque un tag da cui `Build & Deploy` può
calcolare il prossimo diff.

Accetta tre input:
- `branch` (opzionale): se valorizzato (es. `main`, `feature/x`), ripulisce **solo** i tag di quel branch —
  sia Git (`backend-<branch>-*`, `frontend-<branch>-*`) sia le immagini Docker corrispondenti su `ghcr.io`
  (`clubmanager-backend`/`clubmanager-frontend`), tramite l'API di GitHub Packages (non
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
(`environment: development`): assegna il tag di versione reale alle immagini già buildate in sviluppo.
Promuove sempre e solo **main**, per costruzione (vedi sotto) — coerente col fatto che, per ora, `feature/**`
e `fix/**` deployano sullo stesso namespace di sviluppo di `main` e non rappresentano ancora una produzione
separata (quando ci sarà la pipeline `Promote`, questo workflow verrà rivisto).

Non prende in input l'ID di una run di `Build & Deploy` da promuovere: dato che backend e frontend deployano
in modo indipendente (vedi sopra), non esiste "la run da promuovere" — ogni scope avanza per conto suo,
potenzialmente in run diverse. Per ciascuno dei due scope (`backend`, `frontend`), il workflow:

1. Cerca l'ultimo tag `<scope>-main-*` (creato/avanzato da `deploy-backend`/`deploy-frontend` solo dopo un
   rollout riuscito, vedi sopra) — se non lo trova, fallisce con un errore esplicito (quello scope non è mai
   stato deployato su main).
2. Legge la versione dal `package.json` **al commit di quel tag specifico** (`git show <tag>:<scope>/package.json`
   — non da `HEAD`: backend e frontend possono essere più avanti/indietro l'uno rispetto all'altro).
3. **Crea o sposta** (force-update) il tag di versione reale corrispondente su quel commit:

   | Scope | Tag reale | Fonte versione |
   |---|---|---|
   | `backend` | `server-vX.Y.Z` | `backend/package.json` → `version` |
   | `frontend` | `client-vX.Y.Z` | `frontend/package.json` → `version` |

4. **Assegna il tag di versione reale** (`X.Y.Z`) all'immagine già pushata col tag di data ricavato dal nome
   del tag `<scope>-*` stesso (nessuna variabile/artifact separato), tramite `docker buildx imagetools
   create` (nessun rebuild: aggiunge solo un riferimento sullo stesso digest già presente sul registry).
5. **Triggera** (fire-and-forget, non aspetta che finisca) il workflow **Cleanup build tags** scoped a
   `branch=main` e `preserve_latest=true`, per ripulire i tag `backend-main-*`/`frontend-main-*` (Git e
   Docker) rimasti da eventuali tentativi precedenti su `main` mai promossi — mantenendo sempre il più
   recente per scope, così il prossimo diff di `Build & Deploy` ha ancora una baseline da cui partire.

**Nota sul tag di data e i limiti di GHCR**: il tag di data **non** viene eliminato dall'immagine appena
promossa nello step 4. L'API di GitHub Packages cancella per *versione* (= digest), non per singolo tag:
poiché il tag di versione reale appena creato punta allo stesso digest del tag di data, cancellare quella
versione rimuoverebbe anche il tag reale appena assegnato — sia `cleanup-registry` di `Build & Deploy` sia il
`Cleanup build tags` triggerato dallo step 5 lo sanno e saltano sempre le immagini che hanno anche un tag
`X.Y.Z`.

Per rilasciare una nuova versione di un componente, alza a mano il campo `version` nel `package.json`
corrispondente prima del push su `main`: la pipeline la userà per il tag Git e per il tag Docker al momento
della promozione.

### Struttura dei manifest k8s

I manifest di backend/frontend sono **colocati nel folder del componente a cui appartengono**
(`backend/k8s/`, `frontend/k8s/`), non più in un `k8s/templates/app/` condiviso: così un cambio ai manifest
di un componente ricade sotto lo stesso prefisso di path (`backend/`/`frontend/`) usato da `Build & Deploy`
per decidere cosa buildare/deployare (vedi sopra), senza bisogno di regole separate per "solo k8s".
`k8s/templates/infra/` (usato solo da **Infra**, provisioning namespace/Postgres/Keycloak) resta invece
centralizzato, dato che non appartiene né a backend né a frontend.

```
backend/
├── k8s/                     # manifest con placeholder ${VAR}, applicati da deploy-backend
│   ├── configmap.yaml        # variabili non sensibili (DB_HOST, KEYCLOAK_URL, ...)
│   ├── secret.yaml           # DB_PASSWORD, KEYCLOAK_ADMIN_CLIENT_SECRET
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml           # possiede la richiesta TLS/cert-manager (ClusterIssuer "letsencrypt")
│                               # per l'host condiviso col frontend
└── ...                       # codice del backend

frontend/
├── k8s/                     # manifest con placeholder ${VAR}, applicati da deploy-frontend
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml           # stesso host/secretName TLS del backend, SENZA annotazione cert-manager
│                               # (una sola Certificate per host, gestita dall'Ingress del backend)
└── ...                       # codice del frontend

k8s/
└── templates/infra/          # applicati da Infra (namespace, Postgres condiviso, Keycloak)
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

**Per Environment** (Repository → Settings → Environments → crea `dev` e `prod`, poi per ciascuno
"Environment secrets"/"Environment variables"), non più a livello di repository: `Build & Deploy` e `Tag`
leggono sempre l'Environment `dev`; `Infra` legge l'Environment passato come input (`dev` o `prod`) al
lancio. Le tabelle sotto vanno quindi configurate **due volte**, una per `dev` e una per `prod`, con valori
diversi (hostname, namespace, credenziali VPS/DB/Keycloak di ciascun ambiente). Le **Secrets** sono cifrate
e mai visibili nei log; le **Variables** sono in chiaro, per valori non sensibili.

Usati sia da **Infra** che da **Build & Deploy** salvo dove indicato. `DB_PASSWORD`,
`KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD` e `KEYCLOAK_ADMIN_CLIENT_SECRET` **non vanno inventati a mano**: la prima
volta Infra li genera casualmente e li stampa nel riepilogo della sua run (vedi [Infra](#infra), incluso se
la run fallisce dopo averli generati) — copiali nell'Environment corrispondente (`dev` o `prod`) subito
dopo. **Importante**: se questi Secrets sono già presenti sull'Environment quando rilanci Infra, vengono
**riusati così come sono** invece di rigenerarne di nuovi — fondamentale perché Postgres e Keycloak
persistono i dati tra un run e l'altro (PVC), quindi una password rigenerata ogni volta smetterebbe di
corrispondere a quella realmente impostata al primo avvio, rompendo i login su ogni run successivo al primo.

#### Secrets

| Nome | Descrizione | Esempio |
|------|-------------|---------|
| `SSH_PRIVATE_KEY` | Chiave privata SSH (PEM) corrispondente a una chiave pubblica autorizzata sulla VPS | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `DB_PASSWORD` | Password del database Postgres condiviso (app + Keycloak) — **generata/riusata da Infra**, non a mano | *(copiata dal riepilogo della run Infra)* |
| `KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD` | Password dell'admin console Keycloak (bootstrap, distinto dall'admin applicativo) — **generata/riusata da Infra**, non a mano | *(copiata dal riepilogo della run Infra)* |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | Client secret del client confidential `clubmanager-backend` su Keycloak — **generato/riusato da Infra** | *(copiata dal riepilogo della run Infra)* |
| `GHCR_PAT` | Personal Access Token GitHub con scope `read:packages`, usato da **Build & Deploy** per creare il Secret k8s `ghcr-secret` (`imagePullSecrets` di backend/frontend) — i package su `ghcr.io` sono privati di default, senza questo token i pod restano in `ImagePullBackOff`. **Non riusare il `GITHUB_TOKEN` automatico**: è valido solo per la durata della run, i pod devono poter fare pull in qualunque momento futuro. Genera il token da GitHub → Settings (personali) → Developer settings → Personal access tokens → Tokens (classic) → scope `read:packages` | *(token generato a mano, es. `ghp_xxxxxxxxxxxx`)* |

#### Variables

##### Obbligatorie (nessun default: vanno impostate per ogni Environment)

| Nome | Descrizione | Esempio | Usata da |
|------|-------------|---------|----------|
| `SSH_HOST` | Indirizzo della VPS su cui gira il cluster k8s | `203.0.113.10` | Infra, Build & Deploy |
| `SSH_USER` | Utente SSH per connettersi alla VPS | `deploy` | Infra, Build & Deploy |
| `KUBE_NAMESPACE` | Namespace Kubernetes target — deve essere diverso tra `dev` e `prod` anche se condividono la stessa VPC/cluster | `clubmanager-prod` | Infra, Build & Deploy |
| `APP_DOMAIN` | Hostname pubblico dell'app (usato nell'Ingress per frontend **e** backend sullo stesso host, routing per path: `/api` → backend, `/` → frontend; anche base per `VITE_API_BASE_URL` e per i redirect URI SPA creati da Infra) | `app.clubmanager.example.com` | Infra, Build & Deploy |
| `VITE_TENANT_NAME` | Nome tenant visualizzato in UI, compilato nel bundle frontend | `ASD Roma` | Build & Deploy |
| `KEYCLOAK_HOST` | Hostname pubblico di Keycloak (bare host) — usato sia nell'Ingress di Infra sia per costruire `KEYCLOAK_URL` (`https://` + questo valore); non punta al DNS interno del cluster, il backend valida il claim `iss` del JWT confrontandolo esattamente con `https://KEYCLOAK_HOST` (vedi nota sull'issuer JWT sopra) | `auth.clubmanager.example.com` | Infra, Build & Deploy |
| `DB_HOST` | Host del Postgres condiviso raggiungibile dal cluster (nome del Service creato da Infra, include il namespace) | `clubmanager-postgres.clubmanager-prod.svc.cluster.local` | Build & Deploy |

##### Opzionali (default applicato se non impostate)

| Nome | Descrizione | Esempio | Default | Usata da |
|------|-------------|---------|---------|----------|
| `SSH_PORT` | Porta SSH della VPS | `22` | `22` | Infra, Build & Deploy |
| `DEPLOY_PATH` | Percorso remoto sulla VPS dove copiare i manifest di Build & Deploy — **deve differire** da quello di `prod` se condividono la VPS | `/opt/clubmanager/k8s` | `/opt/clubmanager/k8s` | Build & Deploy |
| `INFRA_DEPLOY_PATH` | Percorso remoto sulla VPS dove copiare i manifest di Infra (diverso da `DEPLOY_PATH` per non mischiarli) — **deve differire** da quello di `prod` se condividono la VPS | `/opt/clubmanager/infra` | `/opt/clubmanager/infra` | Infra |
| `BACKEND_PORT` | Porta interna su cui ascolta il backend (Deployment + ConfigMap `PORT`) | `3000` | `3000` | Build & Deploy |
| `POSTGRES_STORAGE_SIZE` | Dimensione del PVC per l'istanza Postgres condivisa | `5Gi` | `5Gi` | Infra |
| `DB_PORT` | Porta Postgres | `5432` | `5432` | Build & Deploy |
| `DB_NODE_PORT` | Porta `NodePort` su cui esporre Postgres sull'IP pubblico della VPS, per collegarsi da un client locale (DBeaver, ecc.) — feature opt-in, **nessun default**: se non impostata il Service `NodePort` non viene creato (o viene rimosso se era stato creato in precedenza). Vedi sezione "Connessione al DB da un client locale" valori possibili 30000-32767 | `30432` | `-` (disattivato) | Infra |
| `DB_NAME` | Nome del database applicativo (il database `keycloak` è fisso, creato da Infra) | `clubmanager` | `clubmanager` | Infra, Build & Deploy |
| `DB_USER` | Utente Postgres applicativo (condiviso anche da Keycloak) | `clubmanager` | `clubmanager` | Infra, Build & Deploy |
| `KEYCLOAK_BOOTSTRAP_ADMIN` | Username dell'admin console Keycloak (bootstrap, non l'admin applicativo) | `admin` | `admin` | Infra |
| `KEYCLOAK_START_MODE` | Comando di avvio di Keycloak (`args` del container): `start-dev` per sviluppo, `start` (build ottimizzata) per produzione — impostare `start-dev` solo sull'Environment `dev` | `start` | `start` | Infra |
| `KEYCLOAK_REALM` | Realm Keycloak del tenant | `clubmanager` | `clubmanager` | Infra, Build & Deploy |
| `KEYCLOAK_ADMIN_CLIENT_ID` | Client ID del client confidential backend | `clubmanager-backend` | `clubmanager-backend` | Build & Deploy |
| `KEYCLOAK_CLIENT_ID` | Client ID pubblico SPA (compilato nel frontend come `VITE_KEYCLOAK_CLIENT_ID`) | `clubmanager-spa` | `clubmanager-spa` | Build & Deploy |
| `VITE_ACTIVITY_SELECT_VALUES_MAPPING` | Mapping JSON attività→costo di default per il form "Nuovo incontro", compilato nel bundle frontend | `{"Dog Dance":20,"Mantrailing":20,"K9 Cross Training":25,"Educazione singolo":20,"Passeggiata":25,"Piscina":25}` | `{}` (select vuota) | Build & Deploy |
| `VITE_THEME_PRIMARY` | Colore primario (bottoni, link attivi) | `#FF6B4A` | `#FF6B4A` | Build & Deploy |
| `VITE_THEME_PRIMARY_TEXT` | Colore del testo sopra il colore primario | `#ffffff` | `#ffffff` | Build & Deploy |
| `VITE_THEME_DANGER` | Colore per importi negativi/azioni distruttive | `#dc2626` | `#dc2626` | Build & Deploy |
| `VITE_THEME_SUCCESS` | Colore per importi positivi/conferme | `#16a34a` | `#16a34a` | Build & Deploy |
| `VITE_THEME_NAV_BG` | Colore di sfondo della barra di navigazione | `#2E2A26` | `#2E2A26` | Build & Deploy |
| `VITE_THEME_NAV_TEXT` | Colore del testo/voci di menu sulla barra di navigazione, da abbinare a `VITE_THEME_NAV_BG` per restare leggibile | `#F5C36B` | `#F5C36B` | Build & Deploy |
| `LOGO_FILE` | Nome del file SVG in `frontend/branding/` da usare come logo/favicon del tenant. **Non** ha prefisso `VITE_*`: non è letta dal browser ma da `scripts/apply-logo.mjs`, eseguito automaticamente da npm come hook `prebuild` prima di `vite build` | `asd1.svg` | `-` (resta il logo di default) | Build & Deploy |

Nessun secret aggiuntivo serve per il registry immagini: le pipeline si autenticano su `ghcr.io` con il
`GITHUB_TOKEN` automatico di Actions (permesso `packages: write`, già configurato nei workflow).

### Connessione al DB da un client locale (DBeaver, ecc.)

Postgres gira dentro il cluster su un Service `ClusterIP` (solo interno, non raggiungibile da internet).
Due modi per collegarti da un client locale:

#### 1. Tunnel SSH + `kubectl port-forward` (sempre disponibile, nessuna esposizione pubblica)

Da terminale locale:
```bash
ssh -L 5432:localhost:5432 deploy@<IP_VPS> \
  'export KUBECONFIG=/home/deploy/.kube/config && kubectl port-forward -n <namespace> svc/clubmanager-postgres 5432:5432'
```
(sostituisci `<IP_VPS>` e `<namespace>`, es. `clubmanager-dev`; sostituisci `deploy` se il tuo `SSH_USER` è
diverso). Lascia il terminale aperto finché usi il client — il tunnel resta attivo finché la sessione SSH è
connessa.

Poi in DBeaver: host `localhost`, porta `5432`, database/utente/password = `DB_NAME`/`DB_USER`/`DB_PASSWORD`
dell'Environment (default `clubmanager`/`clubmanager`; la password è quella generata da Infra, vedi tabella
sopra).

#### 2. `NodePort` (esposizione pubblica sull'IP della VPS, opt-in)

Imposta `DB_NODE_PORT` (es. `30432`) sull'Environment desiderato e rilancia **Infra**: crea un Service
`NodePort` aggiuntivo (`k8s/templates/infra/postgres-nodeport.yaml`), raggiungibile su
`<IP_VPS>:<DB_NODE_PORT>`. Se in seguito rimuovi/svuoti `DB_NODE_PORT` e rilanci Infra, il Service viene
eliminato automaticamente.

⚠️ **Attenzione**: un `NodePort` espone Postgres su tutte le interfacce della VPS, protetto solo dalla
password del DB. Se lo attivi, filtra la porta via firewall (es. Hetzner Cloud Firewall) al tuo IP
personale — non lasciarla aperta a tutto internet.

In DBeaver: host `<IP_VPS>` (o un DNS che punta allo stesso IP, es. `db-dev.clubby.click`), porta
`DB_NODE_PORT`, stesse credenziali del metodo 1.

## TODO

- [ ] Configurare il DNS di `APP_DOMAIN`/`KEYCLOAK_HOST` verso l'IP pubblico della VPS
      (necessario perché cert-manager possa risolvere la challenge HTTP-01 ed emettere i certificati)
- [ ] Verificare l'emissione dei certificati partendo dal `ClusterIssuer` `letsencrypt-staging` prima di
      passare a `letsencrypt` (produzione), per non consumare il rate limit reale di Let's Encrypt
- [ ] Lanciare la pipeline **Infra** e copiare i valori generati (`DB_PASSWORD`,
      `KEYCLOAK_ADMIN_CLIENT_SECRET`, ecc.) nei GitHub Secrets/Variables prima del primo Build & Deploy
- [ ] Prova pipeline (Build & Deploy, poi Tag)
- [ ] Implementare api Test
- [ ] Definire in dettaglio la strategia di backup di Postgres (CronJob `pg_dump` + storage esterno)
- [ ] Hardening Keycloak in produzione: la modalità di avvio è già parametrica (`KEYCLOAK_START_MODE`, vedi
      [k8s/templates/infra/keycloak-deployment.yaml](k8s/templates/infra/keycloak-deployment.yaml)) — resta
      da impostare `KEYCLOAK_START_MODE=start` sull'Environment `prod` e verificare che Keycloak si avvii e
      funzioni correttamente in modalità `start` (build ottimizzata, non di sviluppo) dietro Traefik
- [ ] Pipeline di promozione in produzione eseguibile solo da main(namespace/ambiente separato da quello di sviluppo condiviso da
      `main`/`feature/**`/`fix/**`)

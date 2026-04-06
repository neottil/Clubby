# ClubManager

Applicazione multi-tenant per la gestione di Associazioni Sportive Dilettantistiche (ASD).

## Funzionalità

- Gestione soci
- Gestione incontri
- Buoni prepagati

## Architettura

- **Frontend**: React 19 + Vite + TypeScript
- **Backend**: Node.js 22, server Express-like nativo per locale, handler compatibili con qualsiasi runtime in prod
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

Creato da `scripts/init-keycloak.sh` — credenziali: admin@clubmanager.local / Admin1234!

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
| GET | `/api/admin/users` | Lista utenti Keycloak | admin |
| POST | `/api/admin/associa-viewer` | Associa viewer a socio (body: socio_id, keycloak_user_id) | admin |
| DELETE | `/api/admin/associa-viewer/:socioId` | Disassocia viewer da socio | admin |
| POST | `/api/admin/promuovi` | Promuovi utente ad admin (body: keycloak_user_id) | admin |

## Sviluppo locale

### Prerequisiti

- Docker + Docker Compose
- Node.js 22+
- npm
- `curl` e `jq` (per init-keycloak.sh)

### Avvio

1. Avvia l'infrastruttura locale:
   ```bash
   docker compose up -d
   ```

2. Attendi che Keycloak sia pronto (circa 60-90 secondi), poi inizializza realm e utenti:
   ```bash
   bash scripts/init-keycloak.sh
   ```
   Questo script crea il realm `clubmanager`, i client, i ruoli e gli utenti di test,
   e scrive automaticamente `backend/.env` e `frontend/.env.local`.

3. Avvia il backend:
   ```bash
   cd backend
   npm install
   npm run dev
   ```

4. Avvia il frontend (in un altro terminale):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

5. Apri http://localhost:5173

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

### Comandi Make

| Comando | Descrizione |
|---------|-------------|
| `make infra-up` | Avvia Postgres + Keycloak (Docker) |
| `make infra-down` | Ferma i container |
| `make infra-reset` | Reset completo (cancella volumi) |
| `make init-keycloak` | Configura Keycloak (una volta) |
| `make dev` | Avvia infra + init keycloak |
| `make dev-backend` | Avvia backend locale |
| `make dev-frontend` | Avvia frontend dev server |
| `make logs-kc` | Log Keycloak |
| `make logs-pg` | Log PostgreSQL |

## Struttura progetto

```
ClubManager/
├── backend/
│   ├── src/
│   │   ├── handlers/       # Handler HTTP (soci, incontri, buoni, admin, auth)
│   │   ├── service/        # Business logic
│   │   ├── middleware/      # Auth (Keycloak JWT), response helpers, error classes
│   │   ├── db/             # Database client (pg Pool) + schema SQL
│   │   └── local/          # Server HTTP locale per sviluppo
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── auth/           # AuthContext (Keycloak OIDC + PKCE)
│   │   ├── api/            # API client factory
│   │   ├── pages/          # SociPage, IncontriPage, BuoniPage, AdminPage, LoginPage
│   │   ├── components/     # Layout
│   │   └── config.ts       # Runtime config (Keycloak URL, realm, client ID)
│   └── package.json
├── scripts/
│   └── init-keycloak.sh    # Setup Keycloak locale
├── docker-compose.yml
└── Makefile
```

## Multi-tenant

Ogni tenant (ASD) è isolato. La configurazione del tenant avviene tramite variabili d'ambiente:
- `VITE_TENANT_NAME`: nome visualizzato del tenant (es. "ASD Roma")
- Ogni tenant ha il proprio realm Keycloak, database e deploy

## Deploy (VPC / Kubernetes)

- **Keycloak**: `KC_PROXY=edge` se dietro load balancer HTTPS, `KC_HOSTNAME=https://auth.tuodominio.com`
- **Backend**: variabile d'ambiente `DB_HOST` punta al servizio Postgres nel cluster
- **JWT verification**: il backend verifica il token JWT via JWKS di Keycloak (ingress opzionale)
- **Secrets**: usare il secret manager del provider cloud scelto
- **Database**: PostgreSQL 16 gestito (RDS, Cloud SQL, o self-hosted)
- Nessuna dipendenza AWS di nessun tipo

### Variabili d'ambiente

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_ADMIN_CLIENT_ID`, `KEYCLOAK_ADMIN_CLIENT_SECRET`
- `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID`, `VITE_API_BASE_URL`

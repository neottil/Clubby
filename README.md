# ClubManager

Applicazione multi-tenant per la gestione di Associazioni Sportive Dilettantistiche (ASD).

## Funzionalità

- Gestione soci
- Gestione incontri
- Buoni prepagati

## Stack

- **Frontend**: React 19 + Vite + TypeScript
- **Backend**: Node.js 22 + Express (local) / handler compatibili con API Gateway
- **Database**: PostgreSQL 16
- **Autenticazione**: Keycloak 26 (OIDC, PKCE, realm roles)
- **Deploy target**: Docker / Kubernetes su VPC privata

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

## Multi-tenant

Ogni tenant (ASD) è isolato. La configurazione del tenant avviene tramite variabili d'ambiente:
- `TENANT` / `VITE_TENANT_ID`: identificativo del tenant
- Ogni tenant ha il proprio realm Keycloak, database e deploy

## Struttura progetto

```
ClubManager/
├── backend/
│   ├── src/
│   │   ├── handlers/       # Handler HTTP (soci, incontri, buoni, admin)
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

## API Endpoints

| Metodo | Path | Handler | Descrizione |
|--------|------|---------|-------------|
| GET/POST | `/api/soci` | soci | Lista / Crea socio |
| GET/PUT/DELETE | `/api/soci/:id` | soci | Dettaglio / Modifica / Elimina |
| GET/POST | `/api/incontri` | incontri | Lista / Crea incontro |
| GET/PUT/DELETE | `/api/incontri/:id` | incontri | Dettaglio / Modifica / Elimina |
| GET/POST | `/api/buoni` | buoni | Lista / Crea buono |
| GET | `/api/buoni/:id` | buoni | Dettaglio buono |
| GET/POST | `/api/buoni/:id/movimenti` | buoni | Movimenti del buono |
| GET | `/api/admin/users` | admin | Lista utenti Keycloak |
| POST | `/api/admin/associa-viewer` | admin | Associa viewer a socio |
| DELETE | `/api/admin/associa-viewer/:socioId` | admin | Disassocia viewer |
| POST | `/api/admin/promuovi` | admin | Promuovi utente ad admin |

Tutte le API richiedono un JWT Keycloak valido (Bearer token).

## Deploy (VPC / Kubernetes)

Per il deploy in produzione:

- **Keycloak**: impostare `KC_PROXY=edge` (TLS termination a livello load balancer), `KC_HOSTNAME=https://auth.yourdomain.com`
- **Backend**: connessione diretta a Postgres via pg (`DB_HOST` punta al servizio Postgres nel cluster)
- **JWT verification**: API Gateway o ingress controller verifica il token JWT via JWKS di Keycloak
- **Secrets**: usare il secret manager del provider cloud scelto
- **Database**: PostgreSQL 16 gestito (RDS, Cloud SQL, o self-hosted)

Variabili d'ambiente da configurare per ogni ambiente:
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_ADMIN_CLIENT_ID`, `KEYCLOAK_ADMIN_CLIENT_SECRET`
- `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID`, `VITE_API_BASE_URL`

# ClubManager - Gestione ASD

Applicazione web per la gestione degli incontri e dei buoni prepagati dei soci di una Associazione Sportiva Dilettantistica (ASD).
Ogni ASD dispone di un'**istanza indipendente** del sistema (frontend, backend e database separati), gestita tramite **deploy dedicato** su AWS.

---

## Architettura

### Infrastruttura
- **Frontend**: SPA React (Vite), deploy su S3 + CloudFront
- **Backend**: AWS Lambda (Node.js 22) + API Gateway HTTP API
- **Database**: Amazon Aurora Serverless v2 (PostgreSQL 16)
- **Autenticazione**: Keycloak 26.1 (OIDC, PKCE, realm roles)
  - Locale: Docker Compose
  - Produzione: ECS Fargate + RDS Postgres + ALB
- **Infra-as-code**: CloudFormation (SAM templates)
- **CI/CD**: GitHub Actions

### Multi-tenant
Ogni tenant (ASD) e' isolato:
```
asd1.dominio.com -> Stack: Lambda + API + Aurora + Keycloak + S3 dedicati
asd2.dominio.com -> Stack: Lambda + API + Aurora + Keycloak + S3 dedicati
```

### Ruoli utente
- **admin**: gestisce soci, incontri, buoni, utenti
- **viewer**: puo' visualizzare solo i dati del socio associato

L'associazione tra `viewer` e `socio` e' effettuata da un `admin` tramite il pannello admin.

---

## Sviluppo locale

### Prerequisiti
- Node.js >= 20
- Docker + Docker Compose
- `curl` e `jq` (per init-keycloak.sh)

### Setup

```bash
# 1. Avvia i container (Postgres + Keycloak)
make up

# 2. Configura realm, client, ruoli e utente admin di test
#    Genera automaticamente frontend/.env.local e backend/.env
make init

# 3. Avvia il backend
make be

# 4. In un altro terminale, avvia il frontend
make fe
```

### URL locali
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Keycloak Admin Console: http://localhost:8080 (admin / admin)
- Utente test: admin@clubmanager.local / Admin123!

### Comandi Make
| Comando | Descrizione |
|---------|-------------|
| `make up` | Avvia Postgres + Keycloak (Docker) |
| `make down` | Ferma i container |
| `make reset` | Reset completo (cancella volumi) |
| `make init` | Configura Keycloak (una volta) |
| `make be` | Avvia backend locale |
| `make fe` | Avvia frontend dev server |
| `make logs-kc` | Log Keycloak |
| `make logs-pg` | Log PostgreSQL |

---

## Struttura progetto

```
ClubManager/
├── backend/
│   ├── src/
│   │   ├── handlers/       # Lambda handlers (soci, incontri, buoni, admin)
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
├── infra/
│   ├── keycloak/           # ECS Fargate + RDS per Keycloak
│   ├── backend/            # Lambda + API Gateway + JWT Authorizer
│   ├── db/                 # Aurora Serverless v2
│   ├── frontend/           # S3 + CloudFront
│   └── tenants/            # Configurazioni per-tenant per-environment
├── scripts/
│   └── init-keycloak.sh    # Setup Keycloak locale
├── docker-compose.yml
└── Makefile
```

---

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

---

## Deploy produzione

Ogni stack e' parametrizzato per tenant e ambiente tramite i file in `infra/tenants/`.
I template CloudFormation sono in `infra/*/template.yaml`.

Ordine di deploy:
1. `infra/db/template.yaml` — VPC + Aurora
2. `infra/keycloak/template.yaml` — Keycloak ECS + RDS
3. `infra/backend/template.yaml` — Lambda + API Gateway (JWT Authorizer punta a Keycloak)
4. `infra/frontend/template.yaml` — S3 + CloudFront

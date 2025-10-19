# ClubManager
Gestione soci di un club. Anagrafica, incontri, card prepagate per incntri.

# ARCHITETTURA GLOBALE (definitiva)

## Struttura generale
Ogni ASD avrà una propria istanza completa dell’applicazione:  
- Frontend → React (SPA), hostato su S3 + CloudFront  
- Backend API → Node.js (NestJS consigliato), in container ECS/Fargate  
- Database → Aurora PostgreSQL (una istanza per tenant)  
- Autenticazione → Amazon Cognito (User Pool + Client + Groups admin, viewer)  
- Storage (eventuali file, export, etc.) → Bucket S3 dedicato per tenant  
- Infrastructure as Code (IaC) → Terraform modulare  
- CI/CD → GitHub Actions (build → push ECR → Terraform apply)  
- Domain per tenant → asd1.gestioneasddominio.com, asd2.gestioneasddominio.com, ecc.

## Componenti AWS per ogni tenant

| Componente  | Servizio AWS         | Note principali                          |
|-------------|---------------------|----------------------------------------|
| Frontend    | S3 + CloudFront + Route53 | Hosting statico, HTTPS con ACM         |
| Backend API | ECS + Fargate       | Container stateless (NestJS)            |
| DB          | Aurora PostgreSQL   | Dati reali e persistenti                 |
| Auth        | Cognito User Pool   | Gruppi admin, viewer                     |
| Storage     | S3                  | Per esportazioni o file dei soci        |
| Secrets/Config | SSM Parameter Store o Secrets Manager | Per variabili sensibili     |
| Monitoring  | CloudWatch + X-Ray  | Logging e tracing                        |
| IaC         | Terraform modules   | Parametrizzato con tenant_name, domain, env  |
| Billing tags | Tag AWS            | Tag:Billing:Tenant=asd1, Environment=prod/dev |

## Modello relazionale (Aurora PostgreSQL)
Ogni tenant ha il proprio database, senza campo tenant_id. La coerenza è gestita a livello backend.

### Tabelle principali

**app_user**  
- id: UUID (PK), generato app-side  
- email: TEXT, univoco  
- cognito_sub: TEXT (riferimento sub Cognito)  
- role: TEXT (admin, viewer), coerente con gruppo Cognito  
- display_name: TEXT  
- created_at: timestamptz (default now())

**socio**  
- id: UUID (PK)  
- codice_socio: TEXT (opzionale, univoco)  
- nome, cognome, email, telefono, note: TEXT  
- registered: BOOLEAN (true se registrato via Cognito)  
- created_at: timestamptz (default now())

**viewer_association**  
- id: UUID (PK)  
- user_id: UUID → app_user.id (viewer associato)  
- socio_id: UUID → socio.id (socio corrispondente)  
- created_by: UUID → app_user.id (admin che ha fatto ass.)  
- created_at: timestamptz (default now())  
- Nota: viewer può essere associato solo a un socio (UNIQUE(user_id))

**incontro**  
- id: UUID (PK)  
- socio_id: UUID → socio.id  
- data_incontro: DATE  
- costo: NUMERIC(10,2)  
- note: TEXT  
- created_by: UUID → app_user.id  
- created_at: timestamptz (default now())

**movimento_buono**  
- id: UUID (PK)  
- socio_id: UUID → socio.id  
- importo: NUMERIC(10,2) (positivo per ricarica, negativo per spesa)  
- descrizione: TEXT  
- riferimento_incontro: UUID → incontro.id (NULL se non legato)  
- created_by: UUID → app_user.id  
- created_at: timestamptz (default now())

## Calcolo saldo buono
Non è salvato nel DB ma calcolato lato backend:

```sql
SELECT COALESCE(SUM(importo), 0) AS saldo
FROM movimento_buono
WHERE socio_id = $1;
```

Gestione atomica con transazioni per inserimento incontro, modifica e ricarica.

## Autenticazione / Autorizzazione
- Cognito User Pool con gruppi admin e viewer  
- Middleware backend: verifica JWT Cognito, estrae dati utente e ruoli  
- Access control con middleware authorizeRole([...])  
- Viewer limitati ad accesso sul socio associato

## API REST (definitive)
/api/soci  
- GET /soci (admin) → lista completa soci  
- POST /soci (admin) → crea socio  
- GET /soci/:id (admin o viewer associato) → dettaglio socio  
- PUT /soci/:id (admin) → aggiorna socio

/api/incontri  
- GET /soci/:id/incontri (admin o viewer) → lista incontri socio  
- POST /soci/:id/incontri (admin) → aggiunge incontro (+ movimento spesa)  
- PUT /incontri/:id (admin) → aggiorna incontro e movimento

/api/buono  
- GET /soci/:id/buono (admin o viewer) → saldo e movimenti  
- POST /soci/:id/buono/ricarica (admin) → ricarica (movimento positivo)

/api/viewer-association  
- POST /viewer-association (admin) → associa viewer a socio

/api/me  
- GET /me (viewer) → info utente e socio associato

## Struttura backend (NestJS consigliato)
Moduli:  
- auth (middleware JWT + guard roles)  
- users (gestione utenti: lettura da Cognito + DB)  
- soci (CRUD)  
- incontri (gestione incontri e spese)  
- buono (movimenti e saldo)  
- viewer-association (mapping viewer → socio)  

DB access tramite Prisma o TypeORM con gestione transazioni a livello servizio.

## Ambiente sviluppo locale
- LocalStack (simula Cognito, S3, Secrets)  
- Postgres Docker (simula Aurora)  
- Backend NestJS con mock JWT Cognito  
- Frontend React + Vite collegati al backend locale

Esempio docker-compose.yml:  

```yaml
version: "3.8"
services:
db:
image: postgres:15
environment:
POSTGRES_DB: asd_local
POSTGRES_USER: asd_user
POSTGRES_PASSWORD: asd_pass
ports:
- "5432:5432"
localstack:
image: localstack/localstack
environment:
- SERVICES=cognito,s3,secretsmanager
- EDGE_PORT=4566
ports:
- "4566:4566"
```

## Terraform (deploy replicabili)
- Moduli: base (VPC, IAM, SG), backend, frontend, db, auth  
- Variabili: tenant_name, domain, environment, billing_tags (map)  

Esempio di deploy:  
```
terraform apply -var tenant_name=asd1
-var domain=asd1.gestioneasddominio.com
-var environment=prod
-var billing_tags='{"Billing:Tenant":"asd1","Environment":"prod"}'
```

## Piano di lavoro (step operativi)
- Inizializzare repo GitHub (monorepo backend/, frontend/, infra/)  
- Implementare backend locale (NestJS + PostgreSQL)  
- Middleware JWT mock sostituito con Cognito verifier  
- Endpoint API minimi + frontend React (login mock, dashboard admin, scheda socio)  
- Configurare LocalStack (Cognito, S3 mock), test login e flussi  
- Scrivere moduli Terraform (backend, frontend, db, cognito, networking)  
- Collegare GitHub Actions per build & deploy automatico  
- Deploy ambiente test AWS → test.gestioneasddominio.com  
- Replica per nuovi tenant (asd1, asd2, ...) tramite variabili Terraform  

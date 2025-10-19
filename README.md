# 🧩 Gestione ASD - Architettura e Analisi Tecnica

## 📘 Panoramica
Applicazione web per la gestione degli incontri e dei buoni prepagati dei soci di una Associazione Sportiva Dilettantistica (ASD).  
Ogni ASD dispone di un’**istanza indipendente** del sistema (frontend, backend e database separati), gestita tramite **deploy dedicato** su AWS.

---

## 🏗️ Architettura Generale

### ☁️ Panoramica infrastrutturale
- **Frontend**: SPA React/Next.js, deploy su S3 + CloudFront  
- **Backend**: AWS Lambda (Node.js 20) + API Gateway (HTTP API)  
- **Database**: Amazon Aurora Serverless v2 (PostgreSQL compatibile)  
- **Autenticazione**: Amazon Cognito (User Pool + Hosted UI)  
- **Infra-as-code**: Terraform  
- **CI/CD**: GitHub Actions  
- **Dev locale**: LocalStack per simulare servizi AWS

Ogni tenant (ASD) è isolato:
asd1.gestioneasddominio.com → Stack: Lambda + API + Aurora + Cognito + S3 dedicati
asd2.gestioneasddominio.com → Stack: Lambda + API + Aurora + Cognito + S3 dedicati

---

## ⚙️ Componenti Principali

### 🧠 Cognito (Autenticazione)
- Gestisce login/signup e ruoli utente:
  - **admin**: gestisce soci, incontri, buoni
  - **viewer**: può visualizzare solo i dati del socio associato
- L’associazione tra `viewer` e `socio` è effettuata da `admin` dopo la registrazione.
- Cognito è l’unica fonte di autenticazione (no API interne di login).

---

### 🧾 Aurora Serverless v2 (Database)
Configurazione tipica:
- Min ACU: `0.5`
- Storage: 2 GB (espandibile)
- Backup giornaliero (retention hot 30 giorni, cold 6 mesi)
- Data API attiva per accesso da Lambda

#### 📄 Schema relazionale

```sql
-- Soci
CREATE TABLE socio (
  id UUID PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  cognome VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  telefono VARCHAR(50),
  data_iscrizione DATE DEFAULT CURRENT_DATE,
  id_account_viewer VARCHAR(255) NULL, -- ID Cognito associato (viewer)
  note TEXT
);

-- Incontri
CREATE TABLE incontro (
  id UUID PRIMARY KEY,
  socio_id UUID REFERENCES socio(id) ON DELETE CASCADE,
  data_incontro DATE NOT NULL,
  costo DECIMAL(10,2) NOT NULL,
  note TEXT
);

-- Buoni prepagati
CREATE TABLE buono (
  id UUID PRIMARY KEY,
  socio_id UUID REFERENCES socio(id) ON DELETE CASCADE,
  data_creazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  saldo_iniziale DECIMAL(10,2) NOT NULL
);

-- Movimenti del buono
CREATE TABLE movimento_buono (
  id UUID PRIMARY KEY,
  buono_id UUID REFERENCES buono(id) ON DELETE CASCADE,
  data_movimento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  importo DECIMAL(10,2) NOT NULL, -- positivo: ricarica, negativo: addebito
  descrizione TEXT
);
```
💡 Il saldo del buono viene calcolato come somma dei movimenti, non memorizzato.

## ⚙️ Lambda Architecture
Struttura consigliata

Ogni Lambda gestisce un gruppo logico di API (pattern “Lambda Router per dominio”):

- lambda-soci	/soci, /soci/{id}	CRUD soci
- lambda-incontri	/incontri, /incontri/{id}	Gestione incontri
- lambda-buoni	/buoni, /buoni/{id}, /movimenti	Buoni e movimenti
- lambda-auth	/auth/*	Integrazione Cognito
- lambda-admin	/admin/*	Operazioni privilegiate

Ogni Lambda utilizza un router interno (es. Express o Fastify) e accede ad Aurora tramite Data API.
Nessuna connessione TCP persistente → perfetta compatibilità con Lambda.

## 🔀 API Gateway

Tipo: HTTP API (v2) → più economico e performante del REST API classico

- Autenticazione integrata con Cognito JWT
- Proxy diretto verso le Lambda (1:1 con i domini logici)

## 🧱 Terraform

Terraform gestisce:

- Cognito (User Pool, Client, Domain)
- Aurora Serverless v2 + Secret Manager
- Lambda functions + API Gateway HTTP API
- S3 bucket (frontend e file statici)
- CloudFront distributions
- Route53 records per i sottodomini (asd1.gestioneasddominio.com, ecc.)
- AWS resource tagging (Environment, Tenant, CostCenter) per fatturazione separata

##🔧 CI/CD (GitHub Actions)

Ogni repository (o monorepo con più ambienti) include pipeline GitHub Actions che:

- Eseguono build e test
- Deployano con Terraform (backend + DB + Cognito)
- Deployano il frontend su S3 + CloudFront

Branch tipici:
- main: produzione
- develop: test/staging

## 🧰 Sviluppo Locale
### 🧱 LocalStack

In locale vengono simulati i servizi AWS:

- Lambda
- API Gateway
- S3
- Cognito (mock)

Aurora Serverless (DB Postgres locale)

Esempio docker-compose.yml per sviluppo locale:
```yaml
version: "3.9"
services:
  localstack:
    image: localstack/localstack:latest
    ports:
      - "4566:4566"
    environment:
      - SERVICES=lambda,apigateway,s3,secretsmanager,cognito
      - DEFAULT_REGION=eu-west-1
      - DATA_DIR=/tmp/localstack/data
    volumes:
      - ./localstack:/var/lib/localstack
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - localnet

  app:
    build: .
    command: npm run dev
    environment:
      - AWS_ENDPOINT=http://localstack:4566
      - AWS_REGION=eu-west-1
    volumes:
      - .:/app
    ports:
      - "3000:3000"
    depends_on:
      - localstack
    networks:
      - localnet

networks:
  localnet:
    driver: bridge
```
## 💰 Stima dei Costi Mensili (per tenant)
```
Servizio	Stima Mensile	Note
Aurora Serverless v2	~$43	0.5 ACU, 2 GB storage
Lambda (6 funzioni)	~$0.01	~100 invocazioni/mese
API Gateway (HTTP API)	~$0.02	~100 richieste/mese
S3 + CloudFront + Route53	~$5	Static assets + DNS
Cognito	~$0	<10 utenti attivi/mese (free tier)
CloudWatch + Logs	~$1	base logging
Totale stimato	≈ $49–50 / mese per tenant
```

## 🚀 Roadmap Implementativa

- Setup iniziale repo
- Struttura monorepo o repo separati (backend, frontend, infra)
- Config base Terraform + provider AWS
- Implementazione backend
- Setup lambda-soci e API Gateway HTTP API
- Mock Cognito in locale
- Configurazione Cognito reale
- Creazione User Pool, Client App e ruoli
- Deploy Aurora Serverless v2
- Creazione schema iniziale SQL
- Implementazione frontend (React)
- Login via Cognito Hosted UI
- Pagine soci e incontri
- CI/CD con GitHub Actions
- Build, test, deploy automatico
- Replica multi-tenant
- Terraform parametrizzato per asd1, asd2, ecc.
- DNS automatico (asdX.gestioneasddominio.com)

## 🧩 Etichettatura Risorse AWS (per fatturazione separata)

Ogni stack Terraform deve includere i seguenti tag:
```
tags = {
  Project     = "GestioneASD"
  Environment = "prod"
  Tenant      = "ASD1"
  CostCenter  = "ASD1"
}
```

# Deploy su Kubernetes


- **Backend e authorizer**: raggiungono Postgres con il nome completo del Service nel namespace
  `DB_NAMESPACE`, che le pipeline ricavano da sole
- **Authorizer**: hostname pubblico proprio (`AUTH_DOMAIN`), perché il browser vi accede direttamente
- **Verifica dei token**: il backend scarica la chiave pubblica dall'authorizer e non possiede quella privata
- **Secrets**: usare il secret manager del provider cloud scelto
- **Database**: PostgreSQL 16 gestito (RDS, Cloud SQL, o self-hosted)

### Variabili d'ambiente

Vedi la tabella completa in [Variabili e secret da configurare su GitHub](variabili-e-secret.md).

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
  database sull'istanza condivisa, coerente con quanto descritto in [Multi-tenant](architettura.md#multi-tenant).

**Stato attuale**: due pipeline distinte, scope separato (vedi [Pipeline CI/CD](pipeline-ci-cd.md)):
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

Lo script ([scripts/setup-vps-k3s.sh](../../scripts/setup-vps-k3s.sh)) è idempotente (rieseguibile senza effetti
collaterali) e si occupa di:

1. Installare **k3s** (distribuzione Kubernetes leggera, adatta a una singola VPS). k3s include già
   **Traefik** come Ingress Controller di default — non va installato separatamente.
2. Configurare `kubectl` per l'utente di deploy (`DEPLOY_USER`, tipicamente lo stesso `SSH_USER` usato
   dalla pipeline) copiando il kubeconfig generato da k3s in `~/.kube/config`.
3. Installare **cert-manager** e creare due `ClusterIssuer`:
   - `letsencrypt-staging` — per test, nessun limite di rate reale (certificati non fidati dai browser)
   - `letsencrypt` — produzione, usato dall'annotazione `cert-manager.io/cluster-issuer` nei template
     [backend/k8s/ingress.yaml](../../backend/k8s/ingress.yaml) e
     [authorizer/k8s/ingress.yaml](../../authorizer/k8s/ingress.yaml)

Entrambi risolvono la ACME challenge **HTTP-01** tramite Traefik (`ingressClassName: traefik`).

**I certificati si rinnovano automaticamente, nessuna azione manuale richiesta.** cert-manager tiene traccia
della scadenza di ogni certificato (i certificati Let's Encrypt durano 90 giorni) e ne richiede uno nuovo
in automatico circa 2/3 della validità prima della scadenza (quindi tipicamente intorno al giorno ~60),
aggiornando il Secret TLS referenziato dall'Ingress senza downtime. L'unica condizione è che cert-manager
resti in esecuzione nel cluster e che l'host risolva ancora pubblicamente verso la VPS (challenge HTTP-01).

Dopo lo script, il passo successivo è lanciare la pipeline **[Infra](pipeline-ci-cd.md#infra)** (una tantum per
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


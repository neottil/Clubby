# Architettura


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
│   │   ├── pages/          # SociPage, IncontriPage, VouchersPage, ResocontoPage, ResocontiAdminPage, TesseramentiPage, RicevutePage, ImpostazioniPage, InfoPage, LoginPage, CambioPasswordPage
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
  (`TENANT_NAME`), colori (`THEME_*`) e logo (`LOGO_FILE`, uno dei file in `branding/`,
  inclusi nell'immagine).

Attività, costi e istruttori **non** sono variabili d'ambiente: sono dati del tenant, gestiti dal
pagina Impostazioni della sua istanza. Cambiarli non richiede una nuova build del frontend, e le
abilitazioni degli istruttori devono comunque stare dove sta il controllo, non nel bundle del browser.


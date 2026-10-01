# Clubby

Applicazione multi-tenant per la gestione di Associazioni Sportive Dilettantistiche (ASD):
soci, incontri, voucher prepagati, tesseramenti e ricevute.

Tre moduli indipendenti, deployati separatamente:

- **Frontend** — React 19 + Vite + TypeScript
- **Backend** (`backend/`) — Node.js 24, server HTTP nativo, i dati dell'associazione
- **Authorizer** (`authorizer/`) — Node.js 24, account, ruoli e token
- **Database** — PostgreSQL, un'istanza con due database separati e utenti distinti

L'authorizer è l'unico a conoscere le credenziali: ha un proprio database con un
proprio utente Postgres, a cui il backend non ha accesso. Firma i token con una
chiave privata RSA che non esce mai da lì e ne pubblica la parte pubblica su
`/.well-known/jwks.json`; il backend la usa per verificarli, e non può quindi
emetterne di propri.

## Avvio rapido

Servono Docker, Node.js 24+, npm e `openssl`.

```bash
docker compose up -d
```

```bash
bash scripts/init-local.sh
```

```bash
npm run install:all
```

```bash
npm run dev
```

Poi http://localhost:5173, con le credenziali scelte da `init-local.sh`. Al primo
accesso l'applicazione chiede di sostituire la password.

Per dei dati con cui girare — soci, incontri, voucher, ricevute:

```bash
bash scripts/seed-demo-data.sh
```

**Azzera entrambi i database** e li ripopola: vedi
[scripts/seed/README.md](scripts/seed/README.md).

I passi nel dettaglio, il debug e i test stanno in
[docs/developer/sviluppo-locale.md](docs/developer/sviluppo-locale.md).

## Documentazione

**→ [docs/readme/readme.md](docs/readme/readme.md)** è l'indice completo, diviso
per contesto.

Le scorciatoie usate più spesso:

| Cerchi | Vai a |
|---|---|
| Cosa fa l'applicazione | [docs/readme/funzionalita.md](docs/readme/funzionalita.md) |
| Chi vede e chi scrive cosa | [docs/readme/ruoli-e-permessi.md](docs/readme/ruoli-e-permessi.md) |
| Gli endpoint | [docs/readme/api.md](docs/readme/api.md) |
| Avviare, debuggare, testare | [docs/developer/sviluppo-locale.md](docs/developer/sviluppo-locale.md) |
| Database e credenziali di un ambiente deployato | [docs/developer/operazioni-cluster.md](docs/developer/operazioni-cluster.md) |
| Deploy, pipeline, migrazioni | [docs/readme/deploy.md](docs/readme/deploy.md), [docs/readme/pipeline-ci-cd.md](docs/readme/pipeline-ci-cd.md), [docs/readme/migrazioni.md](docs/readme/migrazioni.md) |
| Cosa configurare su GitHub | [docs/readme/variabili-e-secret.md](docs/readme/variabili-e-secret.md) |
| Dove è stata decisa una cosa | [specs/README.md](specs/README.md) |
| Come si lavora su questo progetto | [AGENTS.md](AGENTS.md) |

## Comandi principali

| Comando | Cosa fa |
|---|---|
| `npm run install:all` | Installa le dipendenze dei tre moduli |
| `npm run dev` | Avvia backend, authorizer e frontend insieme |
| `npm run db:migra` | Applica le migrazioni pendenti ai due database |
| `npm run test:api` | Suite delle API (richiede i servizi avviati) |
| `npm run build --prefix frontend` | Build del frontend — è anche il vero type check |
| `npm run version -- <modulo> <major\|minor\|patch>` | Bump della versione di un modulo |

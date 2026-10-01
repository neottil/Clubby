# Variabili e secret da configurare su GitHub


**Per Environment** (Repository → Settings → Environments), non a livello di repository: uno per
`development` e uno per ogni club, ciascuno con i propri "Environment secrets"/"Environment variables".
`Build & Deploy` e `Tag` leggono sempre l'Environment `development`; `Infra` e `Promote` quello scelto al
lancio. Le tabelle sotto vanno quindi configurate **per ogni Environment**, con i valori di quell'ambiente
(hostname, credenziali, nome del club). Le **Secrets** sono cifrate e mai visibili nei log; le **Variables**
sono in chiaro, per valori non sensibili.

Il **nome dell'Environment** conta: da lì derivano namespace, nomi dei database e cartelle sulla VPS (vedi
[Multi-tenant](architettura.md#multi-tenant)), che quindi non si configurano.

La colonna "Usato da" indica chi li legge; "deploy" = i workflow di deploy, chiamati da **Build & Deploy**
per `development` e da **Promote** per i club. Quelli obbligatori vengono controllati all'inizio di ogni
workflow, che si ferma con l'elenco di ciò che manca. `DB_PASSWORD`, `AUTH_DB_PASSWORD`,
`AUTH_JWT_PRIVATE_KEY` e `INITIAL_ADMIN_PASSWORD` **non vanno inventati a mano**: la prima volta Infra li
genera e li stampa nel riepilogo della sua run (vedi [Infra](pipeline-ci-cd.md#infra), anche se la run fallisce dopo
averli generati) — copiali nell'Environment corrispondente subito dopo.

**Importante**: se questi Secrets sono già presenti sull'Environment quando rilanci Infra, vengono
**riusati così come sono** invece di rigenerarne di nuovi. Una chiave di firma rigenerata invaliderebbe di
colpo tutti i token e i refresh token in circolazione, disconnettendo ogni utente. Le password dei
database vengono invece riallineate sugli utenti Postgres a ogni run di Infra.

## Secrets

| Nome | Descrizione | Esempio | Usato da |
|------|-------------|---------|----------|
| `SSH_PRIVATE_KEY` | Chiave privata SSH (PEM) corrispondente a una chiave pubblica autorizzata sulla VPS | `-----BEGIN OPENSSH PRIVATE KEY-----...` | Infra, deploy |
| `GHCR_PAT` | Personal Access Token GitHub con scope `read:packages`, usato per creare nel namespace dell'app il Secret k8s `ghcr-secret` (`imagePullSecrets` di backend, frontend e authorizer) — i package su `ghcr.io` sono privati di default, senza questo token i pod restano in `ImagePullBackOff`. **Non generato da Infra**, **non riusare il `GITHUB_TOKEN` automatico**: è valido solo per la durata della run, i pod devono poter fare pull in qualunque momento futuro. Genera il token da GitHub → Settings (personali) → Developer settings → Personal access tokens → Tokens (classic) → scope `read:packages` | *(token generato a mano, es. `ghp_xxxxxxxxxxxx`)* | deploy |
| `DB_PASSWORD` | Password dell'utente Postgres `<env>-clubby` — **generata/riusata da Infra**, non a mano | *(copiata dal riepilogo della run Infra)* | Infra, deploy del backend |
| `AUTH_DB_PASSWORD` | Password dell'utente Postgres `<env>-auth` — **generata/riusata da Infra**, non a mano | *(copiata dal riepilogo della run Infra)* | Infra, deploy dell'authorizer |
| `AUTH_JWT_PRIVATE_KEY` | Chiave privata RSA (PEM, a capo come `\n` letterali) con cui l'authorizer firma i token — **generata/riusata da Infra**. Cambiarla invalida tutti i token e i refresh token esistenti | *(copiata dal riepilogo della run Infra)* | Infra, deploy dell'authorizer |
| `INITIAL_ADMIN_PASSWORD` | Password temporanea del primo amministratore — **generata/riusata da Infra**, non scelta a mano: va comunque sostituita al primo accesso. Usata dall'authorizer solo se il database degli account è vuoto, ma il deploy la richiede sempre | *(copiata dal riepilogo della run Infra)* | Infra, deploy dell'authorizer |
| `WORKFLOW_PAT` | **Secret di repository, non per Environment** (unico in questa tabella). Personal Access Token con permesso "Workflows: Read and write" (scope `workflow` sui token classic). Serve perché Tag tagga un commit "vecchio" — l'ultimo `<scope>-main-*` deployato, non la punta attuale di `main` — e il `GITHUB_TOKEN` di default rifiuta il push di un tag quando il contenuto di `.github/workflows/` in quel commit non è identico a quello dell'ultimo commit di un branch, condizione quasi certa una volta che i workflow evolvono. **Non riusare `GHCR_PAT`**: quello finisce in un Secret k8s persistito sul cluster, e dargli anche scope `workflow` permetterebbe di modificare le pipeline CI/CD a chiunque legga quel Secret | *(token generato a mano, es. `ghp_xxxxxxxxxxxx`)* | Tag |

## Variables

##### Obbligatorie (nessun default: vanno impostate per ogni Environment)

| Nome | Descrizione | Esempio | Usata da |
|------|-------------|---------|----------|
| `SSH_HOST` | Indirizzo della VPS su cui gira il cluster k8s | `203.0.113.10` | Infra, deploy |
| `SSH_USER` | Utente SSH per connettersi alla VPS | `deploy` | Infra, deploy |
| `DB_NAMESPACE` | Namespace dell'istanza Postgres da usare. Più club possono indicare lo stesso e condividerla; se l'istanza non esiste la crea Infra. Da questo valore le pipeline ricavano anche l'indirizzo del database | `postgres-prod` | Infra, deploy di backend e authorizer |
| `APP_DOMAIN` | Hostname pubblico dell'app (Ingress di frontend **e** backend sullo stesso host, routing per path: `/api` → backend, `/` → frontend; anche base dell'indirizzo delle API in `/config.json`) | `romaasd.clubby.example.com` | deploy |
| `AUTH_DOMAIN` | Hostname pubblico dell'authorizer (bare host). Il browser vi accede direttamente, e questo valore diventa l'issuer dei token (`https://` + questo valore): il backend lo confronta esattamente col claim `iss`, quindi un valore sbagliato fa fallire ogni verifica | `auth.romaasd.clubby.example.com` | deploy |
| `TENANT_NAME` | Nome del club mostrato nell'app, servito al browser in `/config.json` | `ASD Roma` | deploy del frontend |
| `INITIAL_ADMIN_EMAIL` | Email del primo amministratore, creato dall'authorizer solo se il database degli account è vuoto. Va impostata prima di lanciare Infra, che la verifica e la riporta nel riepilogo accanto alla password temporanea generata | `admin@tuodominio.it` | Infra, deploy dell'authorizer |

##### Opzionali (default applicato se non impostate)

| Nome | Descrizione | Esempio | Default | Usata da |
|------|-------------|---------|---------|----------|
| `SSH_PORT` | Porta SSH della VPS | `22` | `22` | Infra, deploy |
| `BACKEND_PORT` | Porta interna su cui ascolta il backend (Deployment + ConfigMap `PORT`) | `3000` | `3000` | deploy del backend |
| `AUTH_PORT` | Porta interna su cui ascolta l'authorizer (Deployment + ConfigMap `PORT`) | `3001` | `3001` | deploy dell'authorizer |
| `POSTGRES_STORAGE_SIZE` | Dimensione del PVC dell'istanza Postgres. Usata **solo quando Infra crea l'istanza**: su un'istanza esistente, condivisa con altri club, non viene riapplicata | `5Gi` | `5Gi` | Infra |
| `DB_PORT` | Porta Postgres | `5432` | `5432` | deploy di backend e authorizer |
| `DB_NODE_PORT` | Porta `NodePort` su cui esporre l'istanza Postgres sull'IP pubblico della VPS, per collegarsi da un client locale (DBeaver, ecc.) — feature opt-in, **nessun default**. Vale per tutta l'istanza, quindi per tutti i club che la condividono, e non viene mai rimossa in automatico (vedi "Connessione al DB da un client locale"). Valori possibili 30000-32767, unici nel cluster | `30432` | `-` (disattivato) | Infra |
| `THEME_PRIMARY` | Colore primario (bottoni, link attivi) | `#FF6B4A` | `#FF6B4A` | deploy del frontend |
| `THEME_PRIMARY_TEXT` | Colore del testo sopra il colore primario | `#ffffff` | `#ffffff` | deploy del frontend |
| `THEME_DANGER` | Colore per importi negativi/azioni distruttive | `#dc2626` | `#dc2626` | deploy del frontend |
| `THEME_SUCCESS` | Colore per importi positivi/conferme | `#16a34a` | `#16a34a` | deploy del frontend |
| `THEME_NAV_BG` | Colore di sfondo della barra di navigazione | `#2E2A26` | `#2E2A26` | deploy del frontend |
| `THEME_NAV_TEXT` | Colore del testo/voci di menu sulla barra di navigazione, da abbinare a `THEME_NAV_BG` per restare leggibile | `#F5C36B` | `#F5C36B` | deploy del frontend |
| `LOGO_FILE` | Nome del file in [`branding/`](../../branding/README.md) da usare come logo e favicon del club. Col modulo Ricevute serve anche un PNG/JPEG omonimo, che il PDF stampa in intestazione. Il deploy si ferma se il file non esiste | `romaasd.svg` | `-` (resta il logo di default) | deploy di backend e frontend |
| `ENABLE_MODULE_TESSERAMENTO` | Attiva il modulo Tesseramento: pagina Tesseramenti, quota nelle Impostazioni e API `/api/tesseramenti`. Attivo **solo** con il valore esatto `true` | `true` | `-` (modulo spento) | deploy di backend e frontend |
| `ENABLE_MODULE_RICEVUTE` | Attiva il modulo Ricevute: pagina Ricevute, emissione delle ricevute in PDF e API `/api/documenti`. Attivo **solo** con il valore esatto `true` | `true` | `-` (modulo spento) | deploy di backend e frontend |
| `RECHARGE_MODE` | Come si registra una ricarica del voucher: `free`, `percentage` o `map` (vedi [Ricariche con valore extra](voucher-tesseramento-ricevute.md#ricariche-con-valore-extra)). Un valore non riconosciuto vale `free` | `map` | `free` | deploy di backend e frontend |

I colori e il logo non richiedono una nuova build: cambiano al successivo deploy del frontend.

Lo stesso vale per i moduli opzionali: si accendono e si spengono cambiando la Variable e rifacendo il
deploy dei due moduli interessati (backend **e** frontend — il backend decide cosa serve, il frontend cosa
mostrare). Il database resta completo in ogni caso: spegnere un modulo non cancella nulla e riaccenderlo
ritrova tutto lo storico.

Nessun secret aggiuntivo serve per il registry immagini: le pipeline si autenticano su `ghcr.io` con il
`GITHUB_TOKEN` automatico di Actions (permesso `packages: write`, già configurato nei workflow).


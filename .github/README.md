# CI/CD — Workflow GitHub Actions

Documentazione dei workflow in questa cartella e dei pattern architetturali usati, pensata per essere
**riusabile su altri progetti** con architettura simile (SPA + API + Kubernetes su una VPS singola, senza
piattaforme cloud managed). Le parti specifiche di questo progetto (nomi immagine, variabili) sono
segnalate; il resto è pensato per essere portato così com'è o quasi.

## Indice

- [Panoramica](#panoramica)
- [Pattern architetturali](#pattern-architetturali)
  1. [GitHub Environments come "ambiente target"](#1-github-environments-come-ambiente-target)
  2. [Build/deploy condizionali via tag Git](#2-builddeploy-condizionali-via-tag-git)
  3. [Ciclo di vita del tag `<scope>-<branch>-<data>`](#3-ciclo-di-vita-del-tag-scope-branch-data)
  4. [Promozione a versione reale](#4-promozione-a-versione-reale)
  5. [Pulizia dei tag superati](#5-pulizia-dei-tag-superati)
  6. [Segreti generati una tantum, riusati non rigenerati](#6-segreti-generati-una-tantum-riusati-non-rigenerati)
- [Insidie note (gotcha)](#insidie-note-gotcha)
- [Workflow, uno per uno](#workflow-uno-per-uno)
- [Come adattarlo a un altro progetto](#come-adattarlo-a-un-altro-progetto)

---

## Panoramica

| Workflow | Trigger | Scopo |
|---|---|---|
| [`infra.yml`](workflows/infra.yml) | Manuale (`workflow_dispatch`) | Provisiona/aggiorna infrastruttura condivisa e a lunga vita: namespace k8s, database, identity provider. Da lanciare una tantum per ambiente. |
| [`build-deploy.yml`](workflows/build-deploy.yml) | Push su branch di sviluppo, o manuale | Builda le immagini Docker cambiate e le deploya, in modo condizionale e indipendente per componente. |
| [`tag.yml`](workflows/tag.yml) | Manuale | Promuove lo stato attualmente deployato a versione "reale" (rilascio), senza rebuild. |
| [`cleanup-build-tags.yml`](workflows/cleanup-build-tags.yml) | Manuale | Ripulisce i tag Git e le immagini Docker superate di un branch. |

Separazione di responsabilità: **Infra** gestisce ciò che ha un ciclo di vita lungo e stato persistente
(database, identity provider) — va eseguito raramente, quasi mai in automatico. **Build & Deploy** gestisce
ciò che è stateless e ricreabile in ogni momento (immagini applicative) — gira ad ogni push. Non mescolare le
due cose nello stesso workflow: un push innocuo sul codice applicativo non deve mai rischiare di toccare un
database o un provisioning con side-effect distruttivi.

## Pattern architetturali

### 1. GitHub Environments come "ambiente target"

Ogni [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
(`dev`, `prod`, ...) ha il proprio set di Variables/Secrets. Un job vi si aggancia con:

```yaml
jobs:
  mio_job:
    environment: dev          # fisso: questo job usa sempre le Variables/Secrets di "dev"
```

oppure, per un workflow che deve poter agire su ambienti diversi a seconda di chi lo lancia:

```yaml
on:
  workflow_dispatch:
    inputs:
      env:
        type: environment      # GitHub mostra un menu a tendina con gli Environment REALMENTE
        required: true          # configurati sul repo (niente elenco `choice` scritto a mano
                                 # che può disallinearsi)
jobs:
  mio_job:
    environment: ${{ inputs.env }}
```

Non serve creare l'Environment a mano in anticipo: **GitHub lo crea automaticamente, vuoto**, al primo run
che lo referenzia — va solo popolato di Variables/Secrets dopo.

Vantaggi rispetto a Variables/Secrets a livello di repository: isolamento netto tra ambienti (impossibile
leggere per errore un DB_HOST di prod da un job agganciato a dev), e possibilità di aggiungere in futuro
protection rule (reviewer richiesti, branch permessi) senza toccare i workflow.

### 2. Build/deploy condizionali via tag Git

Se il repo contiene più componenti indipendenti (qui: `backend`, `frontend`), non ha senso ribuildare e
ridistribuire tutto ad ogni push quando magari è cambiato un solo componente. Il pattern usato:

1. Ogni volta che un componente viene **effettivamente deployato con successo**, viene creato/spostato un
   tag Git `<scope>-<branch>-<data>` sul commit deployato (vedi [punto 3](#3-ciclo-di-vita-del-tag-scope-branch-data)).
2. Alla run successiva sullo stesso branch, si cerca l'ultimo tag di quello scope **raggiungibile da
   `HEAD`** (`git tag --merged HEAD --sort=-creatordate -l "<scope>-<branch>-*" | head -1`) e si fa
   `git diff --name-only <tag> HEAD -- <cartella-dello-scope>/` per sapere cosa è cambiato **solo in quella
   cartella**.
3. Se non è cambiato nulla sotto quella cartella → il job di build/deploy di quello scope **non gira
   affatto** (non solo "salta il rebuild": non tocca proprio il Deployment k8s esistente).
4. Se non si trova nessun tag precedente (prima run in assoluto, o dopo una pulizia) → si builda/deploya
   tutto per quello scope, per sicurezza.

Requisiti perché funzioni:
- Checkout con `fetch-depth: 0` (serve tutta la history e i tag, non l'ultimo commit soltanto).
- Ogni scope deve vivere sotto un proprio prefisso di path coerente (qui: `backend/`, `frontend/`,
  **manifest k8s inclusi** — vedi sotto) così un singolo pattern di `git diff` regge sia i cambi di codice
  sia quelli di manifest.

**Sotto-caso: manifest k8s colocati col codice, non centralizzati.** Se i manifest di un componente
vivessero in una cartella condivisa separata (es. `k8s/templates/app/`), un cambio al solo manifest di quel
componente non ricadrebbe sotto il prefisso di path usato per il diff, e servirebbe una seconda regola ad
hoc per intercettarlo. Colocando i manifest **dentro** la cartella del componente (`backend/k8s/`,
`frontend/k8s/`) il prefisso di path li include già gratuitamente — resta solo da distinguere, all'interno
di quel path, cosa è "codice" (→ serve un rebuild) da cosa è "solo manifest" (→ serve solo un redeploy,
riusando l'ultima immagine buildata):

```bash
CHANGED=$(git diff --name-only "$PREV_TAG" HEAD -- "backend/")
HAS_CODE=false; HAS_K8S_ONLY=false
echo "$CHANGED" | grep -qE '^backend/k8s/' && HAS_K8S_ONLY=true || true
echo "$CHANGED" | grep -vE '^backend/k8s/' | grep -qE '^backend/' && HAS_CODE=true || true
# deploy se HAS_CODE o HAS_K8S_ONLY; rebuild (nuova immagine) solo se HAS_CODE
```

Se il rebuild non serve (solo manifest cambiato) ma il deploy sì, **non esiste un tag `:latest` generico
sicuro da riusare** in un contesto multi-branch/multi-ambiente (quale sarebbe "l'ultima" build? di quale
branch?) — si cerca invece l'ultimo tag Git `<scope>-<branch>-*` di quel branch specifico, che identifica
senza ambiguità l'ultima immagine di quello scope davvero deployata con successo su quel branch.

### 3. Ciclo di vita del tag `<scope>-<branch>-<data>`

Un solo tag per (scope, branch), non due famiglie separate ("tag di build" + "tag di deploy"): lo stesso tag
serve sia da baseline per il diff del punto precedente sia da riferimento per la promozione (punto
successivo). Aggiornato **sempre a fine job, solo dopo un deploy riuscito** (mai prima: un tag creato prima
che il rollout sia confermato potrebbe puntare a un commit/immagine che non funziona):

- **C'era un rebuild** (il codice di quello scope è cambiato) → si crea un tag **nuovo**, con la data di
  *questa* run, sul commit appena deployato. Il nome del tag Docker dell'immagine coincide con la parte
  `<branch>-<data>` del nome del tag Git (stesso valore, derivabile per string-stripping — niente
  variabili/artifact separati da tenere in sync).
- **Era un deploy manifest-only** (nessun rebuild, si è riapplicato un manifest riusando una vecchia
  immagine) → si **sposta in avanti** (force-update) il tag Git **esistente** più recente di quello scope,
  sul commit di questa run, **mantenendo lo stesso nome** (quindi la stessa data, quindi la stessa immagine
  Docker referenziata — corretto, l'immagine non è cambiata). Rinominarlo sarebbe sbagliato: romperebbe il
  collegamento nome-tag → tag-immagine-Docker. Non spostarlo affatto sarebbe anch'esso sbagliato: la
  prossima run rifarebbe lo stesso diff e rileverebbe di nuovo lo stesso cambiamento manifest già gestito,
  ripetendo il redeploy ad ogni run futura finché non arriva un vero rebuild.

### 4. Promozione a versione reale

Un workflow manuale separato (qui `tag.yml`) assegna la versione "vera" (da `package.json` o equivalente)
solo quando qualcuno decide di rilasciare, **senza rebuild**: aggiunge solo un riferimento sullo stesso
digest Docker già pushato (`docker buildx imagetools create --tag <img>:X.Y.Z <img>:<data-tag-esistente>`).

Punto chiave se i componenti sono indipendenti (pattern 2/3): **non esiste più "una singola run da
promuovere"**, perché ogni scope può essere avanzato in run diverse. La promozione quindi:
1. Cerca, **per ciascuno scope indipendentemente**, l'ultimo tag `<scope>-<branch-di-produzione>-*` — se
   non lo trova, salta quello scope (mai deployato lì, nulla da promuovere).
2. **Controlla se quello scope è già promosso**: se il commit di quel tag ha già un tag di versione reale
   che punta esattamente lì, salta — nessuno spostamento di tag, nessun ri-tag Docker. Questo controllo
   basta farlo sui tag Git già nel repo: **non serve leggere lo stato dell'ultima run di build** (né
   artifact né `run_id`) — con scope indipendenti che buildano in run asincrone, "l'ultima run" non è
   comunque un riferimento affidabile su cosa è cambiato dall'ultima promozione, mentre i tag Git (stato
   persistente nel repo) lo sono sempre.
3. Se invece c'è qualcosa di nuovo da promuovere, legge la versione (es. `package.json`) **al commit di
   quel tag specifico** via `git show <tag>:<path>/package.json` — non da `HEAD`, che potrebbe essere più
   avanti di quello scope.
4. Crea/sposta il tag di versione reale su quel commit specifico.
5. Ricava il tag Docker da riferire facendo lo string-stripping inverso del punto 4 sopra (nessun
   `run_id` da passare a mano, nessun artifact da scaricare).
6. Se **almeno uno** scope è stato promosso, triggera (fire-and-forget) il workflow di pulizia (pattern 5)
   scoped al branch di produzione con `preserve_latest=true` — sicuro perché mantiene comunque il tag
   appena promosso come baseline per il prossimo diff. Se è stato promosso **un solo** scope, passa anche lo
   scope specifico (l'altro non è cambiato, non c'è motivo di ripulirlo in questa run); se sono stati
   promossi entrambi, lo scope resta vuoto (pulizia di entrambi). Se nessuno scope è stato promosso, questo
   step non gira: non c'è nessuna nuova baseline da preservare.

Sicurezza incorporata: se lo schema dei tag include sempre il nome del branch "di produzione" (qui `main`),
il workflow di promozione **non ha bisogno di validare esplicitamente il branch** — strutturalmente non può
trovare/promuovere nient'altro, dato che cerca solo tag con quel branch nel nome.

**Non spostare mai in silenzio** un tag di versione reale già esistente su un commit diverso, senza che sia
esplicitamente voluto: è quasi sempre sintomo di essersi dimenticati di alzare la versione prima del
rilascio, e riscrivere la storia di una versione già "uscita" può confondere chi fa debug/rollback in futuro.
(In questo repo si è scelto consapevolmente di accettare lo spostamento silenzioso per semplicità — vedi il
commento in cima a `tag.yml` — ma è una scelta, non un default consigliato.)

### 5. Pulizia dei tag superati

Se i tag non sono usa-e-getta (vedi punto 3: qui servono anche da baseline per il diff), **non si può
cancellare alla cieca tutto ciò che matcha un pattern** — si romperebbe il diff della prossima run su quel
branch. Il workflow di pulizia risolve con un input **`preserve_latest` (default `true`)**: raggruppa i tag
trovati per (scope, branch) — estraendo lo slug del branch dal nome del tag, dato che il formato della data
è fisso e riconoscibile (`YYYYMMDD_HHMM`) — e per ciascun gruppo **mantiene sempre il più recente**
(Git + immagine Docker corrispondente), eliminando solo quelli più vecchi. Questo lo rende sicuro da
lanciare **anche in automatico su un branch ancora attivo**: dopo la pulizia resta comunque un tag da cui
calcolare il prossimo diff.

Con componenti indipendenti (pattern 2/3), anche la pulizia va scoped **per scope**, non solo per branch: un
input `scope` (vuoto = entrambi, o un singolo scope) permette di limitare l'esecuzione a un solo componente.
Serve soprattutto al trigger automatico dopo una promozione (pattern 4): se in quella run è stato promosso
un solo scope, non ha senso ripulire anche l'altro, che non è cambiato — passare `scope=<quello>` evita
lavoro (e rumore nei log) inutile. Per una pulizia manuale di un intero branch concluso, di solito si lascia
vuoto (entrambi gli scope).

`preserve_latest=false` è per un caso diverso: un branch **concluso/mergiato**, i cui tag non servono più a
nessuno — lì si può ripulire per intero senza mantenere nulla.

Per la pulizia delle immagini Docker, l'azione generica `actions/delete-package-versions` non supporta un
filtro "elimina solo le versioni con questo tag": va usata direttamente l'API REST di GitHub Packages
(`gh api /users/<owner>/packages/container/<image>/versions`, filtrando lato script sui
`metadata.container.tags`). Salvaguardia sempre presente, indipendente da `preserve_latest`: **mai**
eliminare una versione (= digest) che ha anche un tag di versione reale (`X.Y.Z` o simile) — l'API di GHCR
cancella per digest, non per singolo tag, quindi cancellare un tag "vecchio" su un digest condiviso con un
tag reale eliminerebbe anche quello.

Con `preserve_latest=true` il workflow di pulizia diventa sicuro da **triggerare automaticamente** subito
dopo una promozione riuscita (pattern 4) — non c'è più motivo di lasciarlo solo manuale: il tag appena
promosso resta comunque come baseline per il diff successivo.

### 6. Segreti generati una tantum, riusati non rigenerati

Per un workflow che genera segreti casuali per un'infrastruttura persistente (password DB, client secret),
**non rigenerarli ad ogni run**: se il Secret esiste già sull'Environment, riusalo. Il motivo: se
l'infrastruttura sottostante (DB, identity provider) persiste i dati tra un run e l'altro, una password
rigenerata ad ogni run smette di corrispondere a quella realmente impostata al primo avvio, rompendo
l'accesso ad ogni run successiva alla prima.

```bash
if [ -n "$EXISTING_SECRET" ]; then
  echo "value=$EXISTING_SECRET" >> "$GITHUB_OUTPUT"   # riusa
else
  echo "value=$(openssl rand -base64 24)" >> "$GITHUB_OUTPUT"   # genera solo se non esiste già
fi
```

Corollario: lo step che stampa i segreti generati nel riepilogo della run (`$GITHUB_STEP_SUMMARY`) deve
girare con `if: always()`, **anche se un passo successivo della stessa run fallisce** — altrimenti, se il
fallimento avviene dopo che il segreto è già stato usato per creare qualcosa di persistente (es. l'utente
del DB), quel valore va comunque copiato subito nell'Environment, altrimenti la run successiva ne genera uno
diverso e disallinea tutto.

## Insidie note (gotcha)

Problemi reali incontrati costruendo questi workflow, non ovvi in anticipo:

- **`kubectl` su k3s senza `KUBECONFIG` esplicito**: se `kubectl` è un symlink al binario di k3s (comune
  quando si installa k3s su un nodo senza un `kubectl` upstream preesistente), invocato senza `KUBECONFIG`
  risolve di default su `/etc/rancher/k3s/k3s.yaml` (proprietà `root:root`, `600`) — illeggibile da un
  utente non-root anche se `~/.kube/config` esiste ed è corretto per quell'utente. Fix: `export
  KUBECONFIG="$HOME/.kube/config"` esplicito all'inizio di ogni script che esegue `kubectl` via SSH.
- **Immagini private su `ghcr.io`**: un package pushato per la prima volta da un workflow è **privato** di
  default. Senza un `imagePullSecrets` sul Deployment, i pod restano in `ImagePullBackOff`. Il Secret va
  creato con un **Personal Access Token dedicato** (`read:packages`), non con il `GITHUB_TOKEN` della run:
  quello è valido solo per la durata della pipeline, mentre i pod devono poter fare pull in qualunque
  momento futuro (restart, rischedulazione).
- **Due `Ingress` sullo stesso host/certificato**: se due componenti (es. frontend e backend) condividono
  lo stesso hostname pubblico mediante due `Ingress` k8s separati (uno per path), solo **uno dei due** deve
  portare l'annotazione `cert-manager.io/cluster-issuer` — altrimenti cert-manager tenta di gestire due
  `Certificate` per lo stesso secret e i due Ingress "litigano". L'altro referenzia lo stesso `secretName`
  TLS senza richiederlo lui stesso.
- **`git tag -fa` + `push --force` sposta un tag esistente senza avvisare**: se un tag di versione reale
  esiste già su un commit diverso da quello che si vorrebbe taggare, `-f` lo sposta silenziosamente. Se non
  è il comportamento voluto, va controllato esplicitamente prima (`git rev-parse -q --verify
  "refs/tags/$TAG^{commit}"`) e si fallisce con un errore chiaro se il tag esiste già su un commit diverso.
- **`workflow_dispatch` non richiamabile finché il file del workflow non esiste sul branch di default**:
  GitHub registra un workflow (lo mostra nella tab Actions, abilita "Run workflow") solo quando il suo file
  YAML è presente sul branch di default del repo — anche se esiste già su un altro branch. Per iterare su un
  workflow ancora in sviluppo su un branch feature, basta però che il file esista una prima volta sul branch
  di default: da lì in poi si può scegliere "Use workflow from: <branch feature>" per eseguire la versione
  del branch, senza dover mergiare ad ogni modifica.
- **`GITHUB_TOKEN` non triggera altri workflow** se usato per generare un evento `push` (es. un tag pushato
  dal workflow stesso non fa scattare un altro workflow in ascolto su quel push) — per "restrizione anti
  ricorsione" di GitHub. Non si applica invece a un dispatch esplicito (`gh workflow run` / API
  `workflow_dispatch`), che funziona normalmente anche se lanciato con il `GITHUB_TOKEN` della run.

## Workflow, uno per uno

### `infra.yml`

**Trigger**: manuale, con input `env` (tipo `environment` — menu a tendina sugli Environment realmente
configurati), più eventuali parametri di bootstrap (qui: email/password del primo utente admin).

**Cosa fa**: applica in modo idempotente (`kubectl apply`, mai `create` puro) l'infrastruttura di base:
namespace, database condiviso, identity provider, più uno o più Job k8s one-shot per l'inizializzazione
applicativa (qui: creazione realm/client/ruoli OIDC). Genera/riusa i segreti necessari (pattern 6) e li
stampa nel riepilogo della run (con `if: always()`, anche in caso di fallimento parziale).

**Assunzioni**: presuppone che il cluster k8s di base (qui: k3s + Traefik + cert-manager) sia già stato
provisionato **manualmente una volta** sulla VPS (script separato, non-CI, eseguito da un operatore con
accesso root) — questo workflow non crea il cluster, ci si appoggia sopra.

### `build-deploy.yml`

**Trigger**: push sui branch di sviluppo/feature, o manuale.

**Cosa fa**: per ciascuno scope (qui: backend, frontend) applica i pattern 2 e 3 sopra — diff condizionale,
build solo se serve, deploy solo se serve, mai un rebuild "a vuoto" su un deploy manifest-only. Sequenza
job: `versions` (diff + calcolo tag di data) → `build-<scope>` (condizionale) → `deploy-<scope>`
(condizionale, con `if: always()` per girare comunque quando il build collegato è stato saltato non fallito)
→ `cleanup-registry` (pulizia immagini Docker, mantiene le N più recenti per repository indipendentemente
dal branch).

**Non tocca mai** l'infrastruttura di `infra.yml`: legge le sue variabili (host DB, host identity provider)
ma non le modifica né le ricrea.

### `tag.yml`

**Trigger**: manuale, nessun input (vedi pattern 4 — non serve più specificare cosa promuovere).

**Cosa fa**: applica il pattern 4 — per ciascuno scope, trova l'ultimo tag di deploy sul branch di
produzione; se quel commit è già coperto da un tag di versione reale, **salta** quello scope (già
promosso, nessuna modifica); altrimenti legge la versione al commit giusto, crea/sposta il tag di versione
reale, ri-tagga l'immagine Docker esistente senza rebuild. Se **almeno uno** scope è stato promosso,
triggera (fire-and-forget) `cleanup-build-tags.yml` scoped al branch di produzione con
`preserve_latest=true` — e con `scope` limitato al solo scope appena promosso, se ne è stato promosso uno
solo (vuoto, cioè entrambi, se sono stati promossi entrambi); se nessuno scope aveva bisogno di essere
promosso, questo step non gira.

### `cleanup-build-tags.yml`

**Trigger**: manuale, oppure automatico (fire-and-forget) a fine `tag.yml`. Input: `scope` (opzionale:
vuoto = entrambi, `backend`/`frontend` per uno solo), `branch` (opzionale: vuoto = tutti i branch),
`preserve_latest` (default `true`) e `dry_run` (default `true`).

**Cosa fa**: applica il pattern 5 — elimina i tag Git e le immagini Docker superate di un branch (e, se
specificato, di un solo scope), raggruppati per (scope, branch), mantenendo sempre il più recente di
ciascun gruppo se `preserve_latest=true`, con salvaguardia sulle versioni aliasate a un tag reale.
`dry_run=true` di default: primo lancio sempre "a vuoto" per rivedere cosa verrebbe toccato prima di
cancellare davvero.

## Come adattarlo a un altro progetto

Checklist per portare questi pattern su un nuovo repo:

1. Decidi gli **scope indipendenti** (di solito: un backend, un frontend, eventualmente altri servizi) e
   colocaci dentro sia il codice sia i relativi manifest di deploy (pattern 2) — evita cartelle di manifest
   centralizzate condivise tra scope diversi.
2. Crea gli **Environment GitHub** che ti servono (almeno uno per lo sviluppo continuo, es. `dev`) e
   decidi quali workflow vi si agganciano fissi e quali lo scelgono a runtime (pattern 1).
3. Nel workflow di build/deploy, implementa il diff condizionale per scope (pattern 2) e lo schema di tag
   `<scope>-<branch>-<data>` con la logica "crea se rebuild, sposta se manifest-only" (pattern 3).
4. Nel workflow di promozione, elimina qualunque `run_id`/lookup di run specifica: fai leggere sempre
   l'ultimo tag `<scope>-<branch-produzione>-*` per ciascuno scope indipendentemente (pattern 4).
5. Aggiungi un workflow di pulizia separato, mai auto-triggerato se i tag non sono usa-e-getta (pattern 5).
6. Se un workflow genera segreti per infrastruttura persistente, applica il pattern "genera solo se non
   esiste già" (pattern 6) fin dall'inizio — è molto più facile da subito che da aggiungere dopo un
   incidente di credenziali disallineate.
7. Rivedi la lista delle [insidie note](#insidie-note-gotcha): quasi tutte si presentano identiche su
   qualunque stack k3s + GHCR + GitHub Actions, indipendentemente dal linguaggio/framework applicativo.

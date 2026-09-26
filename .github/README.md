# CI/CD — Workflow GitHub Actions

Documentazione dei workflow in questa cartella e dei pattern architetturali usati, pensata per essere
**riusabile su altri progetti** con architettura simile (SPA + API + Kubernetes su una VPS singola, senza
piattaforme cloud managed). Le parti specifiche di questo progetto (nomi immagine, variabili) sono
segnalate; il resto è pensato per essere portato così com'è o quasi.

## Indice

- [CI/CD — Workflow GitHub Actions](#cicd--workflow-github-actions)
  - [Indice](#indice)
  - [Panoramica](#panoramica)
  - [Pattern architetturali](#pattern-architetturali)
    - [1. GitHub Environments come "ambiente target"](#1-github-environments-come-ambiente-target)
    - [2. Build/deploy condizionali via tag Git](#2-builddeploy-condizionali-via-tag-git)
    - [3. Ciclo di vita del tag `<scope>-<branch>-<data>`](#3-ciclo-di-vita-del-tag-scope-branch-data)
    - [4. Deploy come workflow riutilizzabile per scope](#4-deploy-come-workflow-riutilizzabile-per-scope)
    - [5. Tag e Promote separati](#5-tag-e-promote-separati)
    - [6. Pulizia dei tag superati](#6-pulizia-dei-tag-superati)
    - [7. Segreti generati una tantum, riusati non rigenerati](#7-segreti-generati-una-tantum-riusati-non-rigenerati)
  - [Insidie note (gotcha)](#insidie-note-gotcha)
  - [Workflow, uno per uno](#workflow-uno-per-uno)
    - [`infra.yml`](#infrayml)
    - [`build-deploy.yml`](#build-deployyml)
    - [`deploy-backend.yml` / `deploy-frontend.yml`](#deploy-backendyml--deploy-frontendyml)
    - [`tag.yml`](#tagyml)
    - [`promote.yml`](#promoteyml)
    - [`cleanup-build-tags.yml`](#cleanup-build-tagsyml)
  - [Come adattarlo a un altro progetto](#come-adattarlo-a-un-altro-progetto)

---

## Panoramica

| Workflow | Trigger | Scopo |
|---|---|---|
| [`infra.yml`](workflows/infra.yml) | Manuale (`workflow_dispatch`) | Provisiona/aggiorna infrastruttura condivisa e a lunga vita: namespace k8s, database, identity provider. Da lanciare una tantum per ambiente. |
| [`build-deploy.yml`](workflows/build-deploy.yml) | Push su branch di sviluppo, o manuale (input `force_all`) | Builda le immagini Docker cambiate e le deploya in **sviluppo**, in modo condizionale e indipendente per componente. Con `force_all` ribuilda e rideploya tutto, ignorando il diff. |
| [`deploy-backend.yml`](workflows/deploy-backend.yml) / [`deploy-frontend.yml`](workflows/deploy-frontend.yml) / [`deploy-authorizer.yml`](workflows/deploy-authorizer.yml) | Solo `workflow_call` (riutilizzabile) | Applica i manifest k8s di un componente, verifica il rollout. Chiamati sia da `build-deploy.yml` (sviluppo) sia da `promote.yml` (club). |
| [`tag.yml`](workflows/tag.yml) | Manuale | Promuove lo stato attualmente deployato a versione "reale" (tag Git, ri-tag Docker, GitHub Release), senza rebuild. **Non deploya nulla.** |
| [`promote.yml`](workflows/promote.yml) | Manuale (con input `environment` e `<scope>_version`) | Deploya la versione indicata (già taggata da `tag.yml`) nell'**ambiente scelto**, cioè in un club. **Non tagga né rilascia nulla.** |

Namespace, nomi dei database e cartelle sulla VPS di un ambiente non sono Variables: li ricava dal nome
dell'Environment la composite action [`actions/ambiente`](actions/ambiente/action.yml), usata da Infra e
da tutti i workflow di deploy.
| [`migrate-db.yml`](workflows/migrate-db.yml) | `workflow_call` da build-deploy e promote | Applica le migrazioni di schema ai due database di un ambiente, prima dei deploy. |
| [`cleanup-build-tags.yml`](workflows/cleanup-build-tags.yml) | Manuale, o automatico dopo `tag.yml` | Ripulisce i tag Git e le immagini Docker superate di un branch. |

Separazione di responsabilità: **Infra** gestisce ciò che ha un ciclo di vita lungo e stato persistente
(database, identity provider) — va eseguito raramente, quasi mai in automatico. **Build & Deploy** gestisce
il ciclo di sviluppo continuo. **Tag** decide le versioni. **Promote** le porta in produzione. Non mescolare
queste responsabilità nello stesso workflow: un push innocuo sul codice applicativo non deve mai rischiare di
toccare un database o un provisioning con side-effect distruttivi, e taggare una versione non deve mai
comportare un deploy involontario in produzione.

## Pattern architetturali

### 1. GitHub Environments come "ambiente target"

Ogni [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
(qui `development` e uno per club, es. `romaasd`) ha il proprio set di Variables/Secrets. Un job vi si
aggancia con:

```yaml
jobs:
  mio_job:
    environment: development  # fisso: questo job usa sempre le Variables/Secrets di "development"
```

oppure, per un workflow che deve poter agire su ambienti diversi a seconda di chi lo lancia:

```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        type: environment      # GitHub mostra un menu a tendina con gli Environment REALMENTE
        required: true          # configurati sul repo (niente elenco `choice` scritto a mano
                                 # che può disallinearsi)
jobs:
  mio_job:
    environment: ${{ inputs.environment }}
```

Non serve creare l'Environment a mano in anticipo: **GitHub lo crea automaticamente, vuoto**, al primo run
che lo referenzia — va solo popolato di Variables/Secrets dopo. Con un input di tipo `environment`
invece l'Environment deve già esistere, altrimenti non compare nel menu. In entrambi i casi un Environment
vuoto non dà errore da solo: una variabile mancante vale stringa vuota. Per questo ogni workflow di questo
repo controlla come primo passo le Variables/Secrets obbligatorie e si ferma con l'elenco di quelle mancanti.

Vantaggi rispetto a Variables/Secrets a livello di repository: isolamento netto tra ambienti (impossibile
leggere per errore la password del database di un club da un job agganciato a `development`), e possibilità di aggiungere in futuro
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

Questo passo resta **fuori** dal workflow riutilizzabile di deploy (pattern 4): dipende da logica specifica
di questa run (è stato fatto un rebuild o no), non è generico "deploya questo tag su questo ambiente".

### 4. Deploy come workflow riutilizzabile per scope

La logica di deploy vera e propria — render dei manifest (`envsubst`), copia sulla VPS, `kubectl apply`,
verifica rollout — va estratta in un **workflow riutilizzabile per scope** (`workflow_call`), che prende in
input `environment` e `image_tag` e fa **solo** questo. Nessuna conoscenza di *perché* si sta deployando quel
tag né di *dove* venga da (tag di data effimero o versione reale).

Chi lo chiama decide tutto il resto:

```yaml
# build-deploy.yml — sviluppo, tag di data
deploy-backend:
  needs: resolve-backend-image
  uses: ./.github/workflows/deploy-backend.yml
  with:
    environment: development
    image_tag: ${{ needs.resolve-backend-image.outputs.image_tag }}
  secrets: inherit
```

```yaml
# promote.yml — ambiente e versione reale ricevuti come input
deploy-backend:
  needs: validate
  if: inputs.backend_version != ''
  uses: ./.github/workflows/deploy-backend.yml
  with:
    environment: ${{ inputs.environment }}
    image_tag: ${{ needs.validate.outputs.backend_image_tag }}
  secrets: inherit
```

Vantaggio: un cambiamento a *come* si deploya (nuovo step, nuovo manifest da applicare, nuova secret) si
scrive **una volta sola** e vale per entrambi gli ambienti — senza questo refactor la stessa sequenza
scp+ssh+rollout sarebbe duplicata identica in due punti diversi, col rischio concreto di aggiornarne uno e
dimenticare l'altro.

`secrets: inherit` passa tutti i secret disponibili al chiamante; l'`environment:` dichiarato **dentro** il
workflow riutilizzabile (`environment: ${{ inputs.environment }}`) è quello che determina quali
Variables/Secrets vengono effettivamente letti — non quello (se presente) del job chiamante.

Un job che chiama un workflow riutilizzabile (`uses:`) non può avere anche `runs-on`/`steps` propri: se serve
uno step preliminare (qui: risolvere quale tag immagine deployare, o validare gli input di `promote.yml`), va
in un job separato precedente, il cui output diventa la precondizione del job che chiama il workflow
riutilizzabile.

### 5. Tag e Promote separati

A differenza di un progetto con un solo ambiente (dove "promuovi" può fermarsi al versioning), se esiste un
ambiente di produzione fisicamente separato la promozione a versione reale e il deploy in produzione sono
**due workflow distinti**, non due fasi dello stesso workflow.

- **`tag.yml`** — assegna la versione "vera" (da `package.json` o equivalente) solo quando qualcuno decide
  di rilasciare, **senza rebuild**: aggiunge solo un riferimento sullo stesso digest Docker già pushato
  (`docker buildx imagetools create --tag <img>:X.Y.Z <img>:<data-tag-esistente>`), crea/aggiorna una GitHub
  Release per quella versione. **Non deploya nulla.**
- **`promote.yml`** — riceve la versione da deployare come **input esplicito** (non un `run_id`/lookup di
  run specifica), insieme all'ambiente di destinazione, e fa **solo** il deploy, chiamando il workflow
  riutilizzabile (pattern 4) con quell'ambiente. **Non decide nulla, non tagga nulla.**

I due possono succedere in momenti diversi (tagga oggi, promuovi la settimana prossima) e `promote.yml` può
essere rilanciato in ogni momento con la stessa versione per risincronizzare la produzione, senza dover
ripassare da `tag.yml`. Perché separarli: taggare una versione (evento di "decisione", raro, revisionabile
via Release) e farla girare in produzione (evento operativo, che può servire ripetere — es. dopo un deploy
fallito, o per riallineare un ambiente dopo un incidente) sono azioni con un ciclo di vita diverso. Fonderle
in un solo workflow costringerebbe a ritaggare (o a inventare logica ad hoc per evitarlo) ogni volta che
serve solo ri-eseguire il deploy.

Punto chiave se i componenti sono indipendenti (pattern 2/3): **non esiste "una singola run da
promuovere"**, perché ogni scope può essere avanzato in run diverse. `tag.yml` quindi:
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
4. Crea/sposta il tag di versione reale su quel commit specifico e crea/aggiorna la GitHub Release.
5. Ricava il tag Docker da riferire facendo lo string-stripping inverso del punto 4 sopra (nessun
   `run_id` da passare a mano, nessun artifact da scaricare).
6. Se **almeno uno** scope è stato promosso, triggera (fire-and-forget) il workflow di pulizia (pattern 6)
   scoped al branch di produzione con `preserve_latest=true` — sicuro perché mantiene comunque il tag
   appena promosso come baseline per il prossimo diff. Se è stato promosso **un solo** scope, passa anche lo
   scope specifico (l'altro non è cambiato, non c'è motivo di ripulirlo in questa run); se sono stati
   promossi entrambi, lo scope resta vuoto (pulizia di entrambi). Se nessuno scope è stato promosso, questo
   step non gira: non c'è nessuna nuova baseline da preservare.

Sicurezza incorporata in `tag.yml`: se lo schema dei tag include sempre il nome del branch "di produzione"
(qui `main`), il workflow **non ha bisogno di validare esplicitamente il branch** — strutturalmente non può
trovare/promuovere nient'altro, dato che cerca solo tag con quel branch nel nome.

Sicurezza in `promote.yml`, invece: un workflow di deploy con **input liberi** (`backend_version`/
`frontend_version` come stringhe, non un menu a tendina) rischia di deployare qualunque cosa — un typo o una
versione mai taggata potrebbe far fallire il deploy a metà, o peggio deployare qualcosa di sbagliato. Un job
`validate` separato, eseguito **prima** dei job di deploy, verifica che il tag `<scope>-v<versione>` esista
davvero — altrimenti fallisce subito con un errore chiaro invece di procedere.

**Non spostare mai in silenzio** un tag di versione reale già esistente su un commit diverso, senza che sia
esplicitamente voluto: è quasi sempre sintomo di essersi dimenticati di alzare la versione prima del
rilascio, e riscrivere la storia di una versione già "uscita" può confondere chi fa debug/rollback in futuro.
(In questo repo si è scelto consapevolmente di accettare lo spostamento silenzioso per semplicità — vedi il
commento in cima a `tag.yml` — ma è una scelta, non un default consigliato.)

### 6. Pulizia dei tag superati

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
Serve soprattutto al trigger automatico dopo una promozione (pattern 5): se in quella run è stato promosso
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
dopo una promozione riuscita (pattern 5) — non c'è più motivo di lasciarlo solo manuale: il tag appena
promosso resta comunque come baseline per il diff successivo.

### 7. Segreti generati una tantum, riusati non rigenerati

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
- **Un job che chiama un workflow riutilizzabile (`uses:`) non può avere anche `runs-on`/`steps` propri**: se
  serve uno step preliminare (qui: risolvere quale tag immagine deployare, o validare gli input di un
  workflow di deploy), va in un job separato precedente, il cui output/risultato diventa la precondizione
  del job che chiama il workflow riutilizzabile.
- **Un workflow di deploy con input liberi rischia di deployare qualunque cosa**: un input come
  `backend_version`/`frontend_version` (stringa libera, non un menu a tendina) può contenere un typo o una
  versione mai taggata, che farebbe fallire il deploy a metà (o peggio, deployare un'immagine
  inesistente/sbagliata). Un job `validate` separato, eseguito **prima** dei job di deploy, verifica che il
  tag di versione esista davvero.
- **La versione da mostrare non va compilata dentro l'artefatto al build**: è forte la tentazione di
  iniettare le versioni come variabili di build (es. `VITE_*` compilate da Vite nel bundle). Sbagliato in
  due modi: (a) la versione di un componente compilata dentro un **altro** componente si congela all'ultima
  build di quest'ultimo, e un deploy del solo primo non la aggiorna; (b) anche la versione **propria** è
  sbagliata se esiste un flusso di promozione che **ri-tagga l'immagine senza ribuildarla** (`X.Y.Z` da
  `promote.yml`) — il bundle continuerebbe a dichiarare il tag di build. Regola: ogni componente espone la
  propria versione **a runtime**, alimentata al deploy dal tag dell'immagine che sta effettivamente mettendo
  in esecuzione (qui: `APP_VERSION` nel ConfigMap di ciascuno scope → il backend la serve su
  `GET /api/version`, il frontend — che è solo nginx + file statici — come file `/version.json` montato dal
  ConfigMap). Corollario k8s: quel file va montato come **directory**, non con `subPath`, altrimenti kubelet
  non lo aggiorna più quando il ConfigMap cambia.

- **Un flag che accende una funzionalità non sta in un ConfigMap letto con `envFrom`.** Le variabili
  prese da `envFrom` non si aggiornano in un container già avviato, e un deploy che cambia solo il
  ConfigMap lascia la spec del Deployment identica: nessun rollout, quindi il pod continua a girare con
  il valore vecchio, e il flag sembra ignorato. I flag dei moduli opzionali
  (`ENABLE_MODULE_TESSERAMENTO`, `ENABLE_MODULE_FATTURAZIONE`) sono perciò scritti come `env:` nel
  Deployment: cambiarli cambia la spec e il rollout parte da solo. Corollario: lo stesso flag serve a
  due scope diversi (backend per rifiutare le API, frontend per non mostrare le pagine) e viene letto
  dalla **stessa** Variable dell'Environment in entrambi i workflow di deploy — un solo posto da
  cambiare, nessun rischio di disallineamento fra ciò che si vede e ciò che risponde.

- **Il runner è fissato, non `ubuntu-latest`.** Tutti i job girano su `ubuntu-24.04`. `ubuntu-latest` è
  un'etichetta mobile: GitHub la sposta alla LTS successiva a una data annunciata (il 19 ottobre 2026 passa
  a Ubuntu 26.04), e il primo run dopo quel giorno sarebbe anche il primo test della nuova immagine — in
  una pipeline che arriva in produzione, scoperto durante un deploy. Fissarla sposta l'aggiornamento a
  quando lo si decide: si cambia l'etichetta, si lancia un dry-run e una build di prova, e poi si prosegue.

## Workflow, uno per uno

### `infra.yml`

**Trigger**: manuale, con input `environment` (tipo `environment` — menu a tendina sugli Environment
realmente configurati). I dati di bootstrap (qui: email del primo utente admin) stanno fra le Variables
dell'Environment e non negli input: chiesti al lancio andrebbero riscritti a ogni run, e potrebbero non
coincidere con quelli letti dai deploy.

**Cosa fa**: applica in modo idempotente l'infrastruttura di un ambiente: il namespace dell'applicazione,
l'istanza Postgres del namespace `DB_NAMESPACE` **solo se non esiste** (può essere condivisa da più club,
e un ambiente non deve poterla riconfigurare per tutti), e sull'istanza i database e gli utenti del club
con i loro schemi. Genera/riusa i segreti necessari (pattern 7) e li stampa nel riepilogo della run (con
`if: always()`, anche in caso di fallimento parziale).

**Assunzioni**: presuppone che il cluster k8s di base (qui: k3s + Traefik + cert-manager) sia già stato
provisionato **manualmente una volta** sulla VPS (script separato, non-CI, eseguito da un operatore con
accesso root) — questo workflow non crea il cluster, ci si appoggia sopra.

### `build-deploy.yml`

**Trigger**: push sui branch di sviluppo/feature, o manuale con input `force_all` (booleano, default `false`).

**`force_all`**: scavalca il diff e tratta entrambi gli scope come "codice + manifest cambiati", quindi
ribuilda e rideploya tutto. Serve quando lo stato del cluster non è più deducibile dalla history dei commit —
il caso tipico è un namespace ricreato da zero: ConfigMap e Secret applicativi non esistono più, ma per il
diff "non è cambiato niente" e i job di deploy non girerebbero affatto. Come ogni altra run che ribuilda,
crea tag `<scope>-<branch>-<data>` nuovi.

**Cosa fa**: per ciascuno scope (qui: backend, frontend) applica i pattern 2 e 3 sopra — diff condizionale,
build solo se serve, deploy solo se serve, mai un rebuild "a vuoto" su un deploy manifest-only. Sequenza job
per scope: `versions` (diff + calcolo tag di data) → `build-<scope>` (condizionale) →
`resolve-<scope>-image` (determina quale tag deployare, condizionale con `if: always()` per girare comunque
quando il build collegato è stato saltato non fallito) → `deploy-<scope>` (chiama il workflow riutilizzabile,
pattern 4, `environment: development`) → `register-<scope>-tag` (ciclo di vita del tag, pattern 3) →
`cleanup-registry` (pulizia immagini Docker, mantiene le N più recenti per repository indipendentemente dal
branch).

**Non tocca mai** l'infrastruttura di `infra.yml`, né la produzione.

### `deploy-backend.yml` / `deploy-frontend.yml`

**Trigger**: solo `workflow_call` — non compaiono nella tab Actions come workflow lanciabili direttamente.

**Cosa fanno**: vedi pattern 4. Input `environment` e `image_tag`; nessuna conoscenza del chiamante (né del
branch/run di `build-deploy.yml`, né dell'input di `promote.yml`).

### `tag.yml`

**Trigger**: manuale, nessun input (vedi pattern 5 — non serve più specificare cosa promuovere).

**Cosa fa**: vedi pattern 5. Per ciascuno scope, risolve se serve una nuova versione reale (o se è già
stata assegnata), crea/sposta il tag e la GitHub Release, ri-tagga l'immagine Docker esistente senza
rebuild. **Non deploya.** Se almeno uno scope è stato promosso, triggera `cleanup-build-tags.yml`.

### `promote.yml`

**Trigger**: manuale, con input `environment` (il club) e `backend_version`/`frontend_version`/
`authorizer_version` (opzionali, ma almeno uno richiesto).

**Cosa fa**: vedi pattern 5. Rifiuta `development` (gestito da `build-deploy.yml`), valida che i tag di
versione esistano, poi deploya nell'ambiente scelto tramite i workflow riutilizzabili. **Non tagga, non
crea Release.** Sicuro da rilanciare più volte con lo stesso input.

### `migrate-db.yml`

**Trigger**: solo `workflow_call`, da `build-deploy.yml` e `promote.yml`. Input: `environment`,
`backend_image_tag` e `authorizer_image_tag` (un tag vuoto = quel database non viene toccato).

**Cosa fa**: crea un **Job Kubernetes che gira sull'immagine che sta per essere deployata** e applica i
file `.sql` numerati contenuti in quell'immagine, saltando quelli già registrati nella tabella
`migrazione`. Ogni file gira in una transazione insieme alla riga che lo registra. Il workflow attende
l'esito del Job, ne stampa i log nella pipeline e fallisce se il Job fallisce o supera i cinque minuti.

**Perché il Job usa l'immagine nuova**: quell'immagine esiste su `ghcr.io` da quando è stata buildata, e
farci girare un comando non mette in servizio l'applicazione — i pod restano sulla versione precedente
fino al rollout. In cambio si ottiene che le migrazioni applicate sono esattamente quelle che
accompagnano il codice che si sta per deployare, non quelle presenti nel repository al momento della run.

**Perché un Job e non `kubectl exec` nel pod di Postgres**: quel pod sta nel namespace dell'istanza
condivisa fra più club, e il suo socket locale autentica in `trust` — entrarci significa privilegi da
superutente su **tutti** i database di **tutti** i club per migrarne uno solo. Il Job si collega via rete
con le credenziali del singolo club, e funziona identico con un Postgres gestito, dove non c'è nessun pod
in cui entrare. Il Job si porta da sé ciò che gli serve (`ghcr-secret` per il pull e le credenziali del
database) perché ConfigMap e Secret dell'applicazione li applica il deploy del modulo, che gira dopo.

**Perché prima dei deploy e non dopo**: tutti e tre i job di deploy lo mettono fra i propri `needs`,
quindi una migrazione fallita impedisce il rollout invece di lasciare il codice nuovo su uno schema
vecchio. Anche il frontend, che il database non lo tocca: se la migrazione fallisce il backend resta
alla versione precedente, e un frontend nuovo che chiama API non ancora deployate sarebbe rotto
quanto il caso che si sta evitando. O si aggiorna tutto, o non si aggiorna niente. Il
corollario è che le migrazioni devono essere **retrocompatibili** con la versione in esecuzione: un
database più avanti dell'applicazione è innocuo, il contrario no. I cambiamenti distruttivi si fanno in due
release — prima il codice smette di usare la colonna, poi una migrazione la elimina.

**Perché non un tool** (`postgrator`, `node-pg-migrate`, Liquibase) in un modulo dedicato: sarebbe un
quarto artefatto di build, con il proprio Dockerfile, job di build, tag immagine, logica "quale immagine
uso se non è cambiato niente", cleanup del registry e versione da gestire in Promote — per un processo che
vive due secondi. L'immagine del backend contiene già `bash` e `postgresql-client` (servivano al seed),
quindi il Job non richiede né un artefatto né una dipendenza nuova, e il registro delle migrazioni è una
tabella e un ciclo (vedi `scripts/migra.sh`). L'unica cosa che un tool darebbe in più è il **checksum** dei
file già applicati, che accorge se qualcuno modifica una migrazione dopo il fatto: sono venti righe di SQL,
se un giorno servirà.

### `cleanup-build-tags.yml`

**Trigger**: manuale, oppure automatico (fire-and-forget) a fine `tag.yml`. Input: `scope` (opzionale:
vuoto = tutti e tre, `backend`/`frontend`/`authorizer` per uno solo), `branch` (opzionale: si scrive com'è,
lo slug dei tag lo ricava il workflow; vuoto = tutti i branch),
`preserve_latest` (default `true`) e `dry_run` (default `true`).

**Cosa fa**: applica il pattern 6 — elimina i tag Git e le immagini Docker superate di un branch (e, se
specificato, di un solo scope), raggruppati per (scope, branch), mantenendo sempre il più recente di
ciascun gruppo se `preserve_latest=true`, con salvaguardia sulle versioni aliasate a un tag reale.
`dry_run=true` di default: primo lancio sempre "a vuoto" per rivedere cosa verrebbe toccato prima di
cancellare davvero. Chiude con un **riepilogo** nella pagina della run (come `infra.yml`): per ciascuno
scope, i tag Git e le immagini Docker eliminate — o che verrebbero eliminate in dry-run, con i verbi al
condizionale — e i tag mantenuti. Ha `if: always()`, così dopo un fallimento a metà si legge comunque
cosa era già stato toccato.

## Come adattarlo a un altro progetto

Checklist per portare questi pattern su un nuovo repo:

1. Decidi gli **scope indipendenti** (di solito: un backend, un frontend, eventualmente altri servizi) e
   colocaci dentro sia il codice sia i relativi manifest di deploy (pattern 2) — evita cartelle di manifest
   centralizzate condivise tra scope diversi.
2. Crea gli **Environment GitHub** che ti servono e decidi quali workflow vi si agganciano fissi e quali lo
   scelgono a runtime (pattern 1).
3. Estrai la logica di deploy (render manifest, copia, apply, rollout) in un **workflow riutilizzabile per
   scope** (`workflow_call` con input `environment` e `image_tag`, pattern 4) — anche se oggi hai un solo
   punto che deploya: nel momento in cui ne servirà un secondo (promozione, rollback manuale, un secondo
   ambiente), la duplicazione va evitata da subito.
4. Nel workflow di build/deploy, implementa il diff condizionale per scope (pattern 2) e lo schema di tag
   `<scope>-<branch>-<data>` sempre creato ex-novo ad ogni deploy riuscito, mai spostato (pattern 3), tenendo
   il ciclo di vita del tag **fuori** dal workflow riutilizzabile di deploy.
5. Se il progetto ha un ambiente di produzione fisico separato, **separa versioning e deploy in due
   workflow distinti** (pattern 5): uno decide/tagga la versione (nessun `run_id`/lookup di run specifica:
   legge sempre l'ultimo tag `<scope>-<branch-produzione>-*` per ciascuno scope indipendentemente), l'altro
   riceve la versione come input esplicito e deploya soltanto, validando che il tag esista prima di
   procedere.
6. Aggiungi un workflow di pulizia separato, mai auto-triggerato se i tag non sono usa-e-getta (pattern 6).
7. Se un workflow genera segreti per infrastruttura persistente, applica il pattern "genera solo se non
   esiste già" (pattern 7) fin dall'inizio — è molto più facile da subito che da aggiungere dopo un
   incidente di credenziali disallineate.
8. Rivedi la lista delle [insidie note](#insidie-note-gotcha): quasi tutte si presentano identiche su
   qualunque stack k3s + GHCR + GitHub Actions, indipendentemente dal linguaggio/framework applicativo.

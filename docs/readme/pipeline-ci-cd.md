# Pipeline CI/CD (GitHub Actions)


Sette workflow in [.github/workflows](../../.github/workflows), scope separato: **Infra** provisiona una
tantum namespace e Postgres; **Build & Deploy** builda e deploya i tre moduli in sviluppo a ogni push;
**Deploy Backend**/**Deploy Frontend**/**Deploy Authorizer** sono workflow riutilizzabili (nessun
trigger proprio) che applicano davvero i manifest k8s, chiamati sia da `Build & Deploy` sia da
`Promote`; **Tag** promuove manualmente un deploy a "versione reale" (senza deployare nulla);
**Promote** deploya una versione già taggata nell'ambiente di un club (senza taggare nulla).

**GitHub Environments**: `Build & Deploy` e `Tag` sono agganciati (job-level `environment: development`)
sempre e solo all'Environment `development` — ogni push builda e deploya in sviluppo, mai in un club.
`Infra` e `Promote` ricevono invece l'Environment come input (di tipo `environment`: il menu a tendina in
GitHub mostra gli Environment realmente configurati sul repo) e agganciano i job a quello scelto: `Infra`
per preparare `development` o un club, `Promote` per portare una versione in un club (rifiuta
`development`). Le **Variables/Secrets** vanno quindi configurate per Environment (Settings →
Environments), uno per `development` e uno per ogni club.

Namespace, nomi dei database e cartelle sulla VPS **non** sono Variables: li ricava dal nome
dell'Environment l'action [`.github/actions/ambiente`](../../.github/actions/ambiente/action.yml), che valida il
nome ed è usata da Infra e da tutti i workflow di deploy, così la convenzione è scritta in un punto solo.
`Promote` riusa le immagini Docker già pushate su `ghcr.io` da `Build & Deploy` (già taggate per versione
reale da `Tag`) — nessun rebuild.

## Infra

Workflow: [infra.yml](../../.github/workflows/infra.yml).

**Attivazione manuale** (`workflow_dispatch`), con un solo input: `environment` — l'Environment GitHub su
cui agire, `development` o un club. L'email del primo admin non si inserisce al lancio: è la Variable
`INITIAL_ADMIN_EMAIL` dell'Environment, la stessa letta dal deploy dell'authorizer, e Infra si ferma se
manca. Aggancia il job all'Environment scelto,
quindi legge le Variables/Secrets configurate su **quell'Environment**. Da lanciare una tantum per
ambiente, prima del primo deploy, o quando serve riallineare l'infrastruttura. **Presuppone che
`scripts/setup-vps-k3s.sh` sia già stato eseguito a mano sulla VPS** (k3s, Traefik e cert-manager devono
esistere): questa pipeline parte da un cluster già funzionante, non lo crea. È idempotente, quindi
rieseguibile senza distruggere dati esistenti.

1. Genera i valori casuali del club (`openssl`): `DB_PASSWORD`, `AUTH_DB_PASSWORD`, la chiave privata RSA
   `AUTH_JWT_PRIVATE_KEY` con cui l'authorizer firma i token e la password temporanea del primo admin —
   **a meno che non esistano già come Secrets sull'Environment**, nel qual caso li riusa. È indispensabile
   per rilanciare Infra in sicurezza: una chiave di firma nuova invaliderebbe tutti i token in
   circolazione.
2. Renderizza i template [k8s/templates/infra](../../k8s/templates/infra) con `envsubst` e li copia sulla VPS
   via SSH, insieme agli schemi SQL dei due database.
3. Via SSH:
   - crea, se mancano, il namespace dell'applicazione (`clubby-<env>-app`) e quello dell'istanza
     Postgres (`DB_NAMESPACE`);
   - **crea l'istanza Postgres solo se in quel namespace non esiste**: il Secret con la password del
     superutente (generata al momento, resta solo nel cluster e nessun club la conosce), il volume e il
     Deployment. Se l'istanza esiste già — magari creata da un altro club — la riusa senza modificarla:
     riapplicarla con i valori di questo ambiente potrebbe cambiarla per tutti (es. il volume);
   - sull'istanza crea, se mancano, i database `<env>-clubby` e `<env>-auth` e i loro utenti omonimi, ne
     riallinea le password ai Secrets dell'Environment e toglie a qualunque altro utente la possibilità
     di collegarsi a quei database;
   - applica gli schemi dei due database come loro proprietari. Gli schemi sono idempotenti: riapplicarli
     su un database già popolato non tocca i dati.

Database e utenti non li creano script di init di Postgres: quelli girano solo al primo avvio
dell'istanza, e su un'istanza condivisa i club successivi non avrebbero mai i propri database.

L'utente admin iniziale **non** viene creato qui: lo crea l'authorizer al suo primo avvio (durante
`Build & Deploy`), leggendo `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD`, e solo se il database degli
account è ancora vuoto.

Il riepilogo della run (`GITHUB_STEP_SUMMARY`) stampa i valori da copiare a mano nei GitHub
Secrets/Variables — **visibili in chiaro una sola volta**, non vengono salvati altrove: copiali subito.
Lo step gira **sempre** (`if: always()`), anche se un passo precedente fallisce: i secret generati a
inizio run vengono comunque mostrati, così puoi copiarli nell'Environment prima di rilanciare Infra, che
li riuserà.

**Nota sull'issuer**: `AUTH_ISSUER` (`https://` + `AUTH_DOMAIN`, costruito dalle pipeline, non è una
variabile GitHub a sé) deve essere l'**URL pubblico HTTPS** dell'authorizer, non un indirizzo interno al
cluster. L'authorizer lo scrive nel claim `iss` dei token e il backend lo confronta esattamente
([backend/src/middleware/auth.ts](../../backend/src/middleware/auth.ts)): un `AUTH_DOMAIN` sbagliato farebbe
fallire ogni verifica. Il backend raggiunge però l'authorizer sul Service interno
(`AUTH_INTERNAL_URL`), che è cosa diversa e non deve coincidere.

## `Build & Deploy` ([build-deploy.yml](../../.github/workflows/build-deploy.yml))

Si attiva su push su `main`, `feature/**`, `fix/**` (o manualmente). Tutti i branch deployano sullo
**stesso ambiente**, `development` (namespace `clubby-development-app`, a cui il workflow è sempre
agganciato — `environment: development` su ogni job): ogni push su uno di questi branch sovrascrive il
deploy corrente in sviluppo. I club si aggiornano con **Promote**, che riusa le immagini Docker già
pushate su `ghcr.io` da questo workflow, senza rebuild.

**Backend e frontend sono due scope completamente indipendenti**, ciascuno con i propri manifest k8s
colocati nel proprio folder — `backend/k8s/` e `frontend/k8s/` (niente più un `k8s/templates/app/`
condiviso) — e il proprio tag Git `<scope>-<branch>-<data>` (es. `backend-main-20260716_1317`,
`frontend-feature-login-page-20260716_1317`; `/` nel nome branch diventa `-`). **Un solo tag per scope**,
non due: serve sia da baseline per il diff della run successiva sullo stesso branch, sia da riferimento per
il workflow **Tag** (vedi sotto) — niente più distinzione tra tag "di build" e tag "di deploy".

Job separati per scope, ciascuno gira **solo** se serve davvero, e **non tocca mai** il Deployment k8s
dell'altro componente se quello non è cambiato (nessun riavvio/rollout inutile). Il job `versions` diffa
`HEAD` contro l'ultimo tag `<scope>-<branch>-*` —
**per ciascuno scope indipendentemente**, limitato al proprio folder (`backend/` o `frontend/`, `k8s/`
incluso in quanto sottocartella) — e decide:
- qualcosa sotto `backend/` (o `frontend/`), **escluso** `backend/k8s/` (o `frontend/k8s/`), è cambiato →
  builda una nuova immagine e la deploya
- solo `backend/k8s/*.yaml` (o `frontend/k8s/*.yaml`) è cambiato → **nessun rebuild**, ma il manifest viene
  comunque riapplicato, riusando **l'ultima immagine di quello scope effettivamente deployata con successo**
  (mai `:latest`: cerca l'ultimo tag `<scope>-<branch>-*`)
- nessuna modifica rilevante per uno scope → il suo job di deploy non gira affatto, il Deployment resta
  esattamente com'era
- nessuna modifica in nessuno dei due scope → l'intera run si ferma dopo `versions` (nessuna build, nessun
  deploy, nessun tag spostato), con un `::warning::` nel log

Se non trova nessun tag `<scope>-<branch>-*` precedente per uno scope su questo branch (prima run in
assoluto, o dopo una pulizia con il workflow **Cleanup build tags**, vedi sotto), builda e deploya sempre
tutto per quello scope, per sicurezza.

**Forzare tutto** — lanciandolo manualmente c'è l'input `force_all` (default `false`): se attivo, il diff
viene ignorato e sia backend che frontend vengono ribuildati e rideployati. Serve quando lo stato del cluster
non è più deducibile dalla history dei commit: il caso tipico è un namespace ricreato da zero, dove ConfigMap
e Secret applicativi non esistono più ma per il diff "non è cambiato niente", quindi senza forzatura i job di
deploy non girerebbero affatto.

**Come avanza il tag `<scope>-<branch>-*`**, sempre a fine job (`register-backend-tag`/`register-frontend-tag`,
dopo che il job di deploy corrispondente è andato a buon fine):
- se c'era un **rebuild**: crea un tag **nuovo** (`<scope>-<branch>-<data-di-questa-run>`), sul commit appena
  deployato — riferisce la nuova immagine appena pushata.
- se era un deploy **manifest-only** (nessun rebuild): **sposta in avanti** (force-update) il tag
  **esistente** più recente di quello scope sul commit di questa run, **senza rinominarlo** — il nome resta
  invariato (quindi continua a riferire correttamente la stessa vecchia immagine, mai spostata), ma il tag
  ora segna "fino a qui il manifest è già stato applicato", cosicché la prossima run non rilevi di nuovo lo
  stesso cambiamento già gestito.

Job (per ciascuno scope: nomi mostrati per `backend`, `frontend` è identico):

1. **versions**: legge il campo `version` di `backend/package.json` e `frontend/package.json`, calcola un
   **tag di data** `<branch>-yyyymmdd_HHMM` (UTC) univoco per questa run (usato per le immagini Docker e
   come base del nome dei tag Git di ciascuno scope).
2. **build-backend** (condizionale, vedi sopra): la **compilazione avviene qui, nella pipeline** (`npm ci &&
   npm run build`), non nel Dockerfile — `backend/Dockerfile` si limita a impacchettare l'output già
   compilato (`dist/`) in un'immagine Node runtime (per il frontend: build Vite + immagine nginx, senza
   alcuna configurazione del club, che arriva al deploy in `/config.json`). Le immagini
   vengono pushate su GitHub Container Registry (`ghcr.io`) taggate **solo** con il tag di data
   (branch-scoped) e con `latest` — il tag di versione reale (`X.Y.Z`) viene assegnato in seguito dal
   workflow Tag, solo dopo la promozione.
3. **resolve-backend-image** (condizionale, vedi sopra): decide quale tag immagine questa run deve
   deployare — il tag di data appena pushato se c'è stato un rebuild, altrimenti l'ultimo tag
   `backend-<branch>-*` esistente (immagine riusata, nessun rebuild). Logica specifica di questa run
   (branch, history dei tag): resta fuori dal workflow riutilizzabile di deploy al punto successivo.
4. **migrate-db** (se questa run deploya backend o authorizer): chiama
   [`migrate-db.yml`](../../.github/workflows/migrate-db.yml) e applica le migrazioni pendenti ai due database di
   `development`, **prima** dei deploy che le presuppongono — se fallisce, `deploy-backend` e
   `deploy-authorizer` non partono e l'ambiente resta com'era. Vedi
   [Migrazioni dello schema](migrazioni.md).
5. **deploy-backend**: chiama il workflow riutilizzabile [`deploy-backend.yml`](../../.github/workflows/deploy-backend.yml)
   con `environment: development` e il tag risolto al punto precedente — applica **solo** i manifest sotto
   `backend/k8s/` (`configmap.yaml`, `secret.yaml`, `deployment.yaml`, `service.yaml`, `ingress.yaml` —
   quest'ultimo possiede la richiesta TLS/cert-manager per l'host condiviso), poi `kubectl rollout status`
   sul solo Deployment backend. Lo stesso identico workflow è chiamato anche da **Promote** per i
   club (vedi sotto) — nessuna logica di deploy duplicata tra i due contesti.
6. **register-backend-tag**: solo dopo un deploy riuscito, crea/sposta il tag `backend-<branch>-*` (vedi
   sopra "Come avanza il tag").
7. **cleanup-registry**: dopo almeno un deploy riuscito, ripulisce dal registry le immagini taggate solo con
   la data, mantenendo le **3 più recenti** per repository immagine (`clubby-backend`,
   `clubby-frontend`), a prescindere dal branch. I tag di versione reale (`X.Y.Z`) sono sempre esclusi
   da questa pulizia. Non usa più `actions/delete-package-versions` (dismessa, girava forzata su un runtime
   Node deprecato): usa direttamente l'API di GitHub Packages via `gh api`.

I manifest renderizzati (`k8s/rendered/`, contengono credenziali in chiaro) non vengono mai committati
(vedi `.gitignore`) e vivono solo per la durata della run della pipeline.

## `Cleanup build tags` ([cleanup-build-tags.yml](../../.github/workflows/cleanup-build-tags.yml))

**Attivazione manuale**, oppure **automatica** (fire-and-forget) alla fine di ogni promozione riuscita del
workflow **Tag**, scoped a `branch=main` e `preserve_latest=true` (e a `scope` limitato al solo scope
appena promosso, se **Tag** ne ha promosso uno solo in quella run — vedi sotto). I tag `<scope>-<branch>-*`
**non sono usa-e-getta**: sono anche la baseline del diff della prossima run di `Build & Deploy` su quel
branch e il riferimento del workflow **Tag** — per questo, di default (`preserve_latest=true`), per
ciascuno scope e per ciascun branch coinvolto viene sempre **mantenuto il tag più recente** (Git e immagine
Docker corrispondente), eliminando solo quelli più vecchi. Così è sicuro lanciarlo — anche in automatico —
su un branch ancora attivo come `main`: dopo la pulizia resta comunque un tag da cui `Build & Deploy` può
calcolare il prossimo diff.

Accetta quattro input:
- `scope` (opzionale): `backend`, `frontend`, `authorizer`, o vuoto per **tutti e tre** (default). I tre
  moduli sono processati come scope completamente indipendenti (tag Git, immagini Docker, tutto separato) —
  questo input limita la pulizia a uno solo. Usato dal trigger automatico da **Tag** quando ha promosso un
  solo scope in quella run (gli altri non sono cambiati, non c'è motivo di ripulirli). Per una pulizia manuale di
  un branch `feature/**`/`fix/**` concluso, di solito si lascia vuoto (tutti gli scope).
- `branch` (opzionale): si scrive com'è (es. `main`, `feature/refactoring`); alla conversione nello slug dei
  tag (`/` → `-`) pensa il workflow. Se valorizzato, ripulisce **solo** i tag di quel branch — sia Git
  (`<scope>-<branch>-*`) sia le immagini Docker corrispondenti su `ghcr.io`
  (`clubby-backend`, `clubby-frontend`, `clubby-authorizer`), tramite l'API di GitHub Packages (non
  `actions/delete-package-versions`, che non supporta un filtro per tag). Se vuoto, ripulisce i tag di
  **tutti** i branch (`preserve_latest` si applica per singolo branch, non globalmente). In tutti i casi,
  un'immagine il cui digest è aliasato anche da un tag di versione reale (`X.Y.Z`) viene sempre saltata, mai
  eliminata.
- `preserve_latest` (default `true`): mantiene il tag più recente per scope+branch, elimina solo i più
  vecchi. Mettilo a `false` **solo** quando un branch `feature/**`/`fix/**` è concluso e mergiato — in quel
  caso nessuno dei suoi tag serve più a nessuno e si può ripulire per intero (la prossima run di
  `Build & Deploy` su quel branch, se mai ce ne sarà un'altra, ribuilderà/redeployerà tutto da capo).
- `dry_run` (default `true`): elenca solo cosa verrebbe eliminato (tag Git e immagini Docker), senza
  cancellare nulla.

Al termine scrive un **riepilogo** nella pagina della run: i parametri usati e, per ciascuno scope, i tag
Git e le immagini Docker eliminate, oltre ai tag mantenuti. In `dry_run` il riepilogo è al condizionale
("che verrebbero eliminati") e lo dichiara in apertura, così non si scambia per un elenco di cose già
cancellate.

## `Tag` ([tag.yml](../../.github/workflows/tag.yml))

**Attivazione manuale** (`workflow_dispatch`, nessun input, tab Actions → Tag → Run workflow): non parte da
solo dopo `Build & Deploy`. Anche questo workflow è sempre agganciato all'Environment `dev`
(`environment: development`): assegna il tag di versione reale alle immagini già buildate in sviluppo, e crea
la GitHub Release corrispondente. **Non deploya nulla** — il deploy nei club di una versione già
taggata qui è compito separato del workflow **Promote** (vedi sotto). Promuove sempre e solo **main**, per
costruzione (vedi sotto) — coerente col fatto che `feature/**` e `fix/**` deployano sullo stesso namespace di
sviluppo di `main` e non rappresentano una produzione separata.

Non prende in input l'ID di una run di `Build & Deploy` da promuovere: dato che backend e frontend deployano
in modo indipendente (vedi sopra), non esiste "la run da promuovere" — ogni scope avanza per conto suo,
potenzialmente in run diverse. Agisce **solo sugli scope che ne hanno davvero bisogno**: non sposta mai un tag
di versione reale se quello scope non ha nulla di nuovo da promuovere. Per ciascuno dei due scope (`backend`,
`frontend`), il workflow:

1. Cerca l'ultimo tag `<scope>-main-*` (creato/avanzato da `deploy-backend`/`deploy-frontend` solo dopo un
   rollout riuscito, vedi sopra) — se non lo trova, **salta** quello scope (non è mai stato deployato su
   main, non c'è nulla da promuovere; non è più un errore fatale).
2. Controlla se il commit di quel tag è **già coperto da un tag di versione reale** (`git tag --points-at
   <commit>` filtrato su `server-v*`/`client-v*`) — se sì, quello scope è già stato promosso l'ultima volta:
   **salta** (nessuno spostamento di tag, nessun ri-tag Docker). Questo controllo si basa solo sui tag Git già
   nel repo — niente artifact né `run_id` da `Build & Deploy`: backend e frontend buildano/promuovono in run
   indipendenti e asincrone, quindi "l'ultima run di Build & Deploy" non sarebbe comunque un riferimento
   affidabile su cosa è cambiato dall'ultima promozione (i tag Git, essendo stato persistente nel repo, lo sono).
3. Se invece c'è qualcosa di nuovo, legge la versione dal `package.json` **al commit di quel tag specifico**
   (`git show <tag>:<scope>/package.json` — non da `HEAD`: backend e frontend possono essere più
   avanti/indietro l'uno rispetto all'altro).
4. **Crea o sposta** (force-update) il tag di versione reale corrispondente su quel commit:

   | Scope | Tag reale | Fonte versione |
   |---|---|---|
   | `backend` | `server-vX.Y.Z` | `backend/package.json` → `version` |
   | `frontend` | `client-vX.Y.Z` | `frontend/package.json` → `version` |

5. **Assegna il tag di versione reale** (`X.Y.Z`) all'immagine già pushata col tag di data ricavato dal nome
   del tag `<scope>-*` stesso (nessuna variabile/artifact separato), tramite `docker buildx imagetools
   create` (nessun rebuild: aggiunge solo un riferimento sullo stesso digest già presente sul registry).
6. **Crea la GitHub Release** per quel tag di versione reale (idempotente: se esiste già — es. dopo uno
   spostamento del tag sullo stesso nome — la lascia invariata invece di fallire).
7. Se **almeno uno** scope è stato promosso, **triggera** (fire-and-forget, non aspetta che finisca) il
   workflow **Cleanup build tags** scoped a `branch=main` e `preserve_latest=true`, per ripulire i tag
   `backend-main-*`/`frontend-main-*` (Git e Docker) rimasti da eventuali tentativi precedenti su `main` mai
   promossi — mantenendo sempre il più recente per scope, così il prossimo diff di `Build & Deploy` ha ancora
   una baseline da cui partire. Se è stato promosso **un solo** scope, il trigger passa anche `scope=<quello>`
   — l'altro scope non è cambiato, non c'è motivo di ripulirlo in questa run; se sono stati promossi
   entrambi, `scope` resta vuoto (pulisce entrambi). Se nessuno scope è stato promosso (tutto già allineato), questo step non gira:
   non c'è nessuna nuova baseline da preservare.

**Nota sul tag di data e i limiti di GHCR**: il tag di data **non** viene eliminato dall'immagine appena
promossa nello step 4. L'API di GitHub Packages cancella per *versione* (= digest), non per singolo tag:
poiché il tag di versione reale appena creato punta allo stesso digest del tag di data, cancellare quella
versione rimuoverebbe anche il tag reale appena assegnato — sia `cleanup-registry` di `Build & Deploy` sia il
`Cleanup build tags` triggerato dallo step 5 lo sanno e saltano sempre le immagini che hanno anche un tag
`X.Y.Z`.

Per rilasciare una nuova versione di un componente, alza a mano il campo `version` nel `package.json`
corrispondente prima del push su `main`: la pipeline la userà per il tag Git e per il tag Docker al momento
della promozione.

## `Deploy Backend` / `Deploy Frontend` / `Deploy Authorizer` ([deploy-backend.yml](../../.github/workflows/deploy-backend.yml) / [deploy-frontend.yml](../../.github/workflows/deploy-frontend.yml) / [deploy-authorizer.yml](../../.github/workflows/deploy-authorizer.yml))

**Solo `workflow_call`**: non compaiono nella tab Actions come workflow lanciabili direttamente — esistono
solo per essere chiamati da `Build & Deploy` (development) e da `Promote` (club). Prendono in input
`environment` (Environment GitHub da usare) e `image_tag` (tag dell'immagine da deployare — di data o
versione reale, indifferentemente). Ricavano namespace, nomi dei database e cartella sulla VPS dal nome
dell'Environment (action `ambiente`), renderizzano i manifest k8s del proprio scope con `envsubst` leggendo
le Variables/Secrets **dell'Environment ricevuto in input**, li copiano sulla VPS via SSH, li applicano e
verificano il rollout. Nessuna conoscenza di *perché* si sta deployando quel tag né di *chi* li ha chiamati —
un cambiamento a come si deploya (nuovo step, nuovo manifest, nuova secret) si scrive una volta sola e vale
per ogni ambiente.

`Deploy Frontend` genera inoltre con `jq` la configurazione del club — nome, indirizzi di API e
authorizer, colori e logo — e la mette nel ConfigMap del frontend, da cui nginx la serve su
`/config.json`. Si ferma con un errore chiaro se mancano `APP_DOMAIN`, `AUTH_DOMAIN` o `TENANT_NAME`, o se
`LOGO_FILE` non esiste in `branding/`.

## `Promote` ([promote.yml](../../.github/workflows/promote.yml))

**Attivazione manuale**, con input `environment` — l'Environment del club, dal menu a tendina — e
`backend_version`/`frontend_version`/`authorizer_version` (opzionali come stringa, es. `1.4.0` — ma
**almeno uno richiesto**): puoi promuovere un solo componente o più d'uno nella stessa run. La stessa
versione si porta in più club lanciando Promote una volta per club. **Non tagga nulla, non crea Release** —
richiede che la versione indicata sia già stata creata da **Tag** in precedenza.

1. **validate**: rifiuta `development` (lì deploya `Build & Deploy` a ogni push, e una promozione manuale
   ne scavalcherebbe lo stato), poi per ciascuna versione indicata verifica che il tag
   `server-v<versione>`/`client-v<versione>`/`auth-v<versione>` esista davvero nel repo — altrimenti
   fallisce subito con un `::error::` esplicito, invece di procedere con un'immagine inesistente/sbagliata.
2. **migrate-db**: applica le migrazioni pendenti ai database del club, prima dei deploy (vedi
   [Migrazioni dello schema](migrazioni.md)). Un club fermo a una versione vecchia può averne
   parecchie in una volta: vengono applicate in ordine, e quelle già presenti saltate.
3. **deploy-backend** / **deploy-frontend** / **deploy-authorizer** (a seconda degli input valorizzati):
   chiamano i workflow riutilizzabili con l'ambiente scelto e il tag di versione validato — stesso identico
   workflow di deploy usato da `Build & Deploy` per lo sviluppo, nessuna logica duplicata.

Sicuro da rilanciare più volte con lo stesso input (es. per riallineare un club dopo un incidente):
non essendoci alcuno stato/tag da spostare, non ha effetti collaterali oltre al deploy stesso.


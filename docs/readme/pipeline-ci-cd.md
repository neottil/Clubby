# Pipeline CI/CD (GitHub Actions)


Workflow in [.github/workflows](../../.github/workflows), scope separato: **Infra** provisiona una
tantum namespace e Postgres; la **Pipeline** builda e deploya i tre moduli in sviluppo a ogni push e, su
`main`, dopo un'approvazione esegue **Tag** (promuove a "versione reale" lo stato deployato su `main`,
senza deployare nulla) e, dopo un'approvazione per club, **Promote** (deploya le versioni taggate
nell'ambiente di un club, senza taggare nulla; si lancia anche a mano); **Deploy Backend**/**Deploy
Frontend**/**Deploy Authorizer** sono workflow riutilizzabili (nessun trigger proprio) che applicano
davvero i manifest k8s, chiamati sia dalla `Pipeline` sia da `Promote`; **Cleanup build tags** ripulisce i
tag di build superati.

Il flusso di uno sviluppatore: branch `feature/…` → push (deploy in `development` dei soli scope cambiati
rispetto a `main`) → merge in `main` e **cancellazione del branch su GitHub** (deploy del merge in
`development`, e pulizia automatica dei tag del branch chiuso) → nella run partita dal merge, approvazione
di Tag e poi dei club da aggiornare.

**GitHub Environments**: i job di build e deploy della `Pipeline` sono agganciati (job-level
`environment: development`) sempre e solo all'Environment `development` — ogni push builda e deploya in
sviluppo; in un club deploya solo Promote, chiamato dalla Pipeline dopo un'approvazione o lanciato a mano. `Tag` non è
agganciato a nessun Environment: usa solo `GITHUB_TOKEN` e `WORKFLOW_PAT`, secret di repository.
`Infra` e `Promote` ricevono invece l'Environment come input (di tipo `environment`: il menu a tendina in
GitHub mostra gli Environment realmente configurati sul repo) e agganciano i job a quello scelto: `Infra`
per preparare `development` o un club, `Promote` per portare una versione in un club (rifiuta
`development`). Le approvazioni del rilascio usano Environment dedicati e vuoti (`approvazione-tag`,
`approvazione-<club>`), vedi [sotto](#approvazioni-del-rilascio). Le **Variables/Secrets** vanno quindi configurate per Environment (Settings →
Environments), uno per `development` e uno per ogni club.

Namespace, nomi dei database e cartelle sulla VPS **non** sono Variables: li ricava dal nome
dell'Environment l'action [`.github/actions/ambiente`](../../.github/actions/ambiente/action.yml), che valida il
nome ed è usata da Infra e da tutti i workflow di deploy, così la convenzione è scritta in un punto solo.
`Promote` riusa le immagini Docker già pushate su `ghcr.io` dalla `Pipeline` (già taggate per versione
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
`Pipeline`), leggendo `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD`, e solo se il database degli
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

## `Pipeline` ([build-deploy.yml](../../.github/workflows/build-deploy.yml))

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

Se non trova nessun tag `<scope>-<branch>-*` per uno scope su questo branch (primo push di un branch
feature), la baseline è l'ultimo tag `<scope>-main-*` **contenuto nel branch**: uno scope che il branch non
ha toccato non si builda né si deploya, e resta in `development` con l'immagine di `main` — così dopo il
merge non resta in uso nessuna immagine del branch, che la pulizia alla sua cancellazione toglierebbe dal
registry. Uno scope cambiato rispetto a `main` si builda e deploya per intero, anche se è cambiato solo il
manifest (il branch non ha ancora un'immagine sua da riusare). Il job `test` usa per gli scope non
ribuildati la stessa baseline. Senza nemmeno un tag di `main` nel branch (prima run in assoluto, o un
branch aperto prima dell'ultimo tag di `main`, i cui tag più vecchi sono stati ripuliti) builda e deploya
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
   `clubby-frontend`, `clubby-authorizer`), a prescindere dal branch. Sono sempre escluse le immagini con
   un tag di versione reale (`X.Y.Z`) e quella dell'ultimo tag `<scope>-main-*`: bastano tre build di un
   branch feature per farla uscire dalle 3, e Tag ne ha bisogno per promuoverla. Non usa più `actions/delete-package-versions` (dismessa, girava forzata su un runtime
   Node deprecato): usa direttamente l'API di GitHub Packages via `gh api`.

I manifest renderizzati (`k8s/rendered/`, contengono credenziali in chiaro) non vengono mai committati
(vedi `.gitignore`) e vivono solo per la durata della run della pipeline.

## `Cleanup build tags` ([cleanup-build-tags.yml](../../.github/workflows/cleanup-build-tags.yml))

Tre modi di partire:
- **alla cancellazione di un branch su GitHub** (evento `delete`): ripulisce per intero quel branch —
  tutti gli scope, `preserve_latest=false`, `dry_run=false`. È l'ultimo passo del flusso: dopo il merge il
  branch si cancella, e i suoi tag non servono più. La cancellazione di un tag o di `main` non lancia
  niente. Un branch cancellato solo in locale non lancia niente: lì resta la pulizia manuale;
- **in automatico** (fire-and-forget) alla fine di ogni promozione riuscita di **Tag**, scoped a
  `branch=main` e `preserve_latest=true` (e a `scope` limitato al solo scope appena promosso, se Tag ne ha
  promosso uno solo): i tag provvisori di `main` più vecchi non servono più;
- **a mano**, con gli input sotto.

I tag `<scope>-<branch>-*` **non sono usa-e-getta**: sono la baseline del diff della prossima run di
`Pipeline` e il riferimento di **Tag**. Per questo, con `preserve_latest=true`, per ciascuno scope e
per ciascun branch coinvolto resta sempre il **tag più recente** (Git e immagine Docker), e **l'ultimo tag
`<scope>-main-*` di ogni scope non si elimina mai**, qualunque siano gli input: nel riepilogo compare fra i
mantenuti come "baseline di main".

Input:
- `scope` (opzionale): `backend`, `frontend`, `authorizer`, o vuoto per **tutti e tre** (default).
- `branch` (opzionale): si scrive com'è (es. `main`, `feature/refactoring`); alla conversione nello slug dei
  tag (`/` → `-`) pensa il workflow. Se valorizzato, ripulisce **solo** i tag di quel branch esatto — sia Git
  (`<scope>-<branch>-*`) sia le immagini Docker corrispondenti su `ghcr.io`, tramite l'API di GitHub
  Packages. Se vuoto, ripulisce i tag di **tutti** i branch. In tutti i casi un'immagine il cui digest è
  aliasato anche da un tag di versione reale (`X.Y.Z`) viene sempre saltata.
- `preserve_latest` (default `true`): mantiene il tag più recente per scope+branch, elimina solo i più
  vecchi. A `false` elimina tutto tranne l'ultimo tag di `main`: serve a mano solo per un branch concluso
  che non è stato cancellato su GitHub.
- `dry_run` (default `true`): elenca solo cosa verrebbe eliminato, senza cancellare nulla.

Al termine scrive un **riepilogo** nella pagina della run: come è partito, i parametri e, per ciascuno
scope, i tag Git e le immagini Docker eliminate, oltre ai tag mantenuti. In `dry_run` il riepilogo è al
condizionale e lo dichiara in apertura.

## Approvazioni del rilascio

Su `main`, dopo un deploy riuscito in `development` (almeno uno scope deployato, nessun job fallito), la
`Pipeline` non finisce: scrive nel riepilogo che attende le approvazioni e si ferma.

1. **Approva Tag** — la run aspetta sull'Environment `approvazione-tag`. Nella pagina della run si apre
   *Review deployments*, si spunta `approvazione-tag` e si approva: parte **Tag**.
2. **Promote, club per club** — dopo Tag la run apre un ramo per ciascun club della Variable di
   repository `CLUBS`, e ogni ramo aspetta sul proprio `approvazione-<club>`. Si approvano solo i club da
   aggiornare: ogni club approvato riceve Promote con tutti i componenti alle ultime versioni taggate, gli
   altri restano in attesa senza bloccare nessuno. I rami partono anche se Tag non ha promosso niente di
   nuovo: così si porta l'ultimo rilascio in un club rimasto indietro.

Un'approvazione rifiutata fa fallire quel passo, e la run risulta fallita anche se il resto è andato bene.
Un **nuovo push in `main`** annulla le attese ancora aperte della run precedente: resta da approvare solo la
più recente, che promuove comunque l'ultimo stato di `main`. Un'attesa mai approvata scade dopo 30 giorni.
Su un branch feature, o con una run che non ha deployato niente, la Pipeline finisce dopo il deploy.

Ogni attesa controlla che il suo Environment abbia davvero un revisore obbligatorio, e altrimenti fallisce
(composite action [`verifica-approvazione`](../../.github/actions/verifica-approvazione/action.yml)): un
Environment che non esiste GitHub lo crea al volo senza protezioni. La configurazione degli Environment di
approvazione e di `CLUBS` è in [variabili-e-secret.md](variabili-e-secret.md#approvazioni-del-rilascio).

Per un rollback, una versione specifica, un solo componente o un club fuori da `CLUBS` si lancia
**Promote** a mano, senza approvazioni.

## `Tag` ([tag.yml](../../.github/workflows/tag.yml))

**Solo `workflow_call`**: non si lancia da solo, lo esegue la **Pipeline** su `main` dopo l'approvazione
`approvazione-tag`. Nessun Environment. Assegna il tag
di versione reale alle immagini già buildate in sviluppo e crea la GitHub Release corrispondente. **Non
deploya nulla.** Promuove sempre e solo **main**: legge solo tag `<scope>-main-*`, e il primo step rifiuta di
girare da un ref diverso da `main` (chiamato da una run su un altro branch eseguirebbe il `tag.yml` di quel
branch; la Pipeline comunque lo chiama solo su `main`).

Non prende in input l'ID di una run della `Pipeline`: i tre scope deployano in modo indipendente, quindi
non esiste "la run da promuovere". Per ciascuno scope:

1. Cerca l'ultimo tag `<scope>-main-*` — se non c'è, **salta** quello scope (mai deployato su main).
2. Se il commit di quel tag è **già coperto da un tag di versione reale** (`<scope>-vX.Y.Z`), **salta**:
   nessuno spostamento di tag, nessun ri-tag Docker.
3. Altrimenti legge la versione dal `package.json` **al commit di quel tag** (`git show
   <tag>:<scope>/package.json`, non da `HEAD`), crea o sposta su quel commit il tag di versione reale
   `backend-vX.Y.Z` / `frontend-vX.Y.Z` / `authorizer-vX.Y.Z`, assegna il tag Docker `X.Y.Z` all'immagine
   già pushata (`docker buildx imagetools create`, nessun rebuild) e crea la GitHub Release (idempotente).
4. Se **almeno uno** scope è stato promosso, lancia **Cleanup build tags** su `branch=main` con
   `preserve_latest=true` (vedi sopra).
5. Scrive il **riepilogo** della run: una riga per scope con tag di deploy, commit, versione, esito
   (`promosso`, `già promosso`, `mai deployato su main`) e link alla Release, più la riga sulla pulizia.

**Nota sul tag di data e i limiti di GHCR**: il tag di data **non** viene eliminato dall'immagine appena
promossa. L'API di GitHub Packages cancella per *versione* (= digest), non per singolo tag: cancellarla
rimuoverebbe anche il tag reale appena assegnato — `cleanup-registry` e `Cleanup build tags` saltano sempre
le immagini che hanno anche un tag `X.Y.Z`.

Per rilasciare una nuova versione di un componente, alza il campo `version` nel `package.json`
corrispondente prima del push su `main` (`npm run version -- <modulo> <livello>`).

## `Deploy Backend` / `Deploy Frontend` / `Deploy Authorizer` ([deploy-backend.yml](../../.github/workflows/deploy-backend.yml) / [deploy-frontend.yml](../../.github/workflows/deploy-frontend.yml) / [deploy-authorizer.yml](../../.github/workflows/deploy-authorizer.yml))

**Solo `workflow_call`**: non compaiono nella tab Actions come workflow lanciabili direttamente — esistono
solo per essere chiamati dalla `Pipeline` (development) e da `Promote` (club). Prendono in input
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

**Attivazione manuale**, o chiamato dalla **Pipeline** una volta per club, dopo l'approvazione del club
(con tutti i componenti e le ultime versioni taggate). Lanciato a mano non chiede approvazioni. Input: `environment` — l'Environment del club, dal
menu a tendina — e per ciascuno scope una checkbox `deploy_backend` / `deploy_frontend` /
`deploy_authorizer` (predefinite selezionate) e un campo `backend_version` / `frontend_version` /
`authorizer_version`. Campo vuoto = **ultima versione taggata** (la più alta in ordine semantico: `2.10.0`
sta sopra `2.6.0`). Il caso tipico è quindi scegliere il club e premere Run; si tolgono checkbox per
deployare un solo componente, e si scrive una versione per un rollback. La stessa versione si porta in più
club lanciando Promote una volta per club. **Non tagga nulla, non crea Release.**

1. **validate**: rifiuta `development` e che nessuna checkbox sia selezionata. Per ogni scope selezionato:
   con il campo vuoto prende l'ultimo tag `<scope>-vX.Y.Z` (errore se non ce n'è nessuno: le versioni le crea
   Tag, dopo l'approvazione nella Pipeline); con una versione scritta, ne verifica la forma esatta `X.Y.Z` (`2.*` e `v2.10.0` sono
   rifiutati) e che il tag esista. Una versione scritta su un componente non selezionato viene ignorata e
   segnalata. Scrive nel riepilogo una riga per scope: selezionato, versione, origine (`indicata` o
   `ultima taggata`) e link alla Release.
2. **migrate-db**: applica le migrazioni pendenti ai database del club, prima dei deploy (vedi
   [Migrazioni dello schema](migrazioni.md)). Un club fermo a una versione vecchia può averne
   parecchie in una volta: vengono applicate in ordine, e quelle già presenti saltate.
3. **deploy-backend** / **deploy-frontend** / **deploy-authorizer** (per gli scope selezionati):
   chiamano i workflow riutilizzabili con l'ambiente scelto e la versione decisa da `validate` — stesso
   workflow di deploy usato dalla `Pipeline` per lo sviluppo, nessuna logica duplicata.

Sicuro da rilanciare più volte con lo stesso input (es. per riallineare un club dopo un incidente):
non essendoci alcuno stato/tag da spostare, non ha effetti collaterali oltre al deploy stesso.


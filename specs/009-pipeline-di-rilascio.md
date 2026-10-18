# 009 — Pipeline di rilascio: Promote con le ultime versioni, workflow unico, pulizia dei build tag

> Riunisce due lavori sulla pipeline nati lo stesso giorno, il 2026-10-14:
>
> - la [006](006-promote-versioni-automatiche.md) (Promote con le ultime
>   versioni, Tag senza Environment), **confluita qui per decisione
>   dell'utente** perché tocca gli stessi workflow. I suoi requisiti e le sue
>   decisioni sono riportati sotto; il file della 006 resta come storico e il
>   suo numero non si riusa;
> - la verifica di `cleanup-build-tags.yml`: con `preserve_latest=false` la
>   pulizia cancella anche la baseline di `main`. Nella stessa discussione
>   l'utente ha deciso di aggiungere una pulizia automatica alla chiusura del
>   branch feature, e di valutare un **workflow unico** build → tag → promote
>   con intervento umano.

## Stato

- [x] Draft
- [x] Approvata
- [x] In test (utente)
- [ ] Completata

**Riaperta il 2026-10-16** per il [workflow unico](#workflow-unico): l'utente
vuole una sola run che a ogni push in `main` builda, si ferma per
un'approvazione prima di Tag e un'altra, per ciascun club, prima di Promote.
Il resto della spec (Promote, Tag, Cleanup build tags, Build & Deploy) era
approvato ed è già implementato; il workflow manuale `Rilascio` implementato
il 2026-10-16 viene sostituito (requisito W9). I requisiti W1–W10 sono stati
approvati dall'utente il 2026-10-16 e implementati lo stesso giorno.

**Versioni**: nessun modulo. Si toccano solo `.github/workflows/` e la
documentazione: backend, frontend e authorizer non cambiano, e alzarne la
versione produrrebbe tag su immagini identiche alle precedenti (regola 5 di
AGENTS.md).

## Il flusso di riferimento

Il ciclo di lavoro di uno sviluppatore, come lo ha descritto l'utente. È il
flusso che la pipeline deve servire, e il metro con cui si giudica ogni
requisito qui sotto:

1. aprire il branch `feature/…`;
2. lavorare la spec;
3. testare in locale;
4. testare il deploy in `development` (push sul branch → Build & Deploy);
5. fare il merge in `main` ed **eliminare il branch feature**;
6. dopo il deploy automatico del merge, lanciare **Tag**;
7. lanciare **Promote**;
8. ripulire i tag e le immagini del branch chiuso.

Oggi i passi 6, 7 e 8 sono tre workflow manuali distinti, e l'8 si dimentica.
Dopo questa spec l'8 parte da solo al passo 5, e il 6 e il 7 diventano due
approvazioni dentro la run partita dal merge: si approva Tag, poi si approvano
i club da aggiornare ([workflow unico](#workflow-unico)).

## Problema

### Promote e Tag (dalla 006)

1. **Promote chiede versioni che il repository conosce già.** Dopo una run di
   Tag, per portare il rilascio in un club bisogna ricopiare a mano in Promote
   la versione di ciascuno scope (es. `2.10.0`, `2.10.1`, `1.1.0`), leggendola
   dal riepilogo di Tag o dalle Release. È il caso di gran lunga più frequente,
   ed è anche quello in cui un typo porta a un errore di validazione (nel
   migliore dei casi) o a deployare una versione vecchia ma esistente (nel
   peggiore: passa la validazione).
2. **Tag è agganciato all'Environment `development` senza motivo.** Il job non
   legge nessuna Variable e usa solo `GITHUB_TOKEN` e `WORKFLOW_PAT`, che è un
   secret **di repository** ([variabili-e-secret.md](../docs/readme/variabili-e-secret.md)).
   La riga è un residuo della rinomina `dev` → `development` (commit `5cfb930`)
   e ha due effetti indesiderati:
   - ogni run di Tag registra un **deployment su `development`**, che Tag non
     tocca: lo storico dei deployment di sviluppo mente;
   - il job ha accesso ai secret di `development` (credenziali dei database di
     sviluppo) che non usa, contro la separazione per Environment descritta in
     [.github/README.md](../.github/README.md#1-github-environments-come-ambiente-target).
3. **Tag non è limitato a `main`.** È un `workflow_dispatch` senza vincoli:
   dal menu *Use workflow from* si può lanciare da qualunque branch, e in quel
   caso gira **il `tag.yml` di quel branch**. I dati restano quelli di `main`
   (legge solo tag `*-main-*`), ma il codice che crea tag di versione, sposta
   tag con `--force` e crea Release può essere una versione mai entrata in
   `main`. Il commento in testa a `tag.yml` ("intrinsecamente solo main") vale
   per i dati, non per il codice.

### Pulizia dei build tag

4. **`preserve_latest=false` cancella anche la baseline di `main`.** In
   `cleanup-build-tags.yml` il tag più recente di un branch viene messo fra
   quelli da mantenere solo se `preserve_latest` è `true` (step "Calcola cosa
   mantenere e cosa eliminare"); altrimenti finisce nella lista da eliminare,
   `main` compreso, e le immagini seguono la stessa lista. Basta lanciarlo a
   mano con `branch` vuoto (tutti i branch) o `branch=main`. Le conseguenze:
   - Build & Deploy su `main` non trova più un tag `<scope>-main-*` da cui
     calcolare il diff (`git tag --merged HEAD … -l "${SCOPE}-${BRANCH_SLUG}-*"`)
     e ribuilda e rideploya tutti gli scope;
   - Tag non trova nessun `<scope>-main-*` e salta la promozione, come se
     `main` non fosse mai stato deployato.
5. **Anche `cleanup-registry` di Build & Deploy può cancellare l'immagine di
   `main`.** Il job tiene le **3 immagini non di release più recenti per
   repository, di qualunque branch**. Tre build di un branch feature bastano a
   cancellare l'immagine dell'ultimo `<scope>-main-*` non ancora promosso. Il
   tag Git resta, quindi il diff funziona, ma:
   - Tag fallisce su `docker buildx imagetools create`, che parte proprio da
     quell'immagine per aggiungerle il tag `X.Y.Z`;
   - un push su `main` che cambia solo i manifest (`<scope>/k8s/`) riusa
     l'ultima immagine deployata di quello scope, che non esiste più.
6. **La pulizia automatica copre solo `main`.** Tag lancia Cleanup build tags
   su `branch=main` con `preserve_latest=true`, e questo resta giusto. Ma i tag
   del branch feature appena chiuso, che non servono più a nessuno, restano
   finché qualcuno non lancia la pulizia a mano.
7. **La prima build di un branch feature deploya tutto.** Senza un tag del
   branch da cui partire, Build & Deploy builda e deploya tutti e tre gli scope
   ("Nessun tag precedente su questo branch: prima build, eseguo tutto"). Dopo
   il merge, la build di `main` rideploya solo gli scope cambiati rispetto
   all'ultimo `<scope>-main-*`: uno scope che il branch non ha toccato resta
   in `development` con l'immagine del branch feature, e la pulizia alla
   cancellazione del branch (C5) la toglie dal registry. Il pod continua a
   girare con l'immagine già sul nodo, ma un riavvio su un nodo che non ce
   l'ha va in `ImagePullBackOff`.

## Obiettivo

Portare un rilascio nei club **approvando** la run partita dal merge in
`main`: una volta per Tag, una per ciascun club da aggiornare, con le ultime
versioni taggate. Con Promote lanciato a mano basta scegliere il club; restano possibili una versione specifica e il deploy di un
solo componente. Tag non è legato a nessun Environment e si lancia solo da
`main`. Il tag più recente di `main` e la sua immagine non si perdono più,
qualunque pulizia giri; alla cancellazione di un branch su GitHub i suoi tag e
le sue immagini vengono ripuliti per intero, senza intervento.

## Fuori perimetro

- **Sapere cosa gira già nel club.** Promote non legge `/api/version` del club
  per saltare i componenti già allineati: rideployare la stessa versione è
  innocuo (il rollout non cambia nulla, le migrazioni già applicate si
  saltano), e il runner non deve dipendere dalla raggiungibilità del club.
- **Infra e i workflow di deploy riutilizzabili** (`deploy-*.yml`,
  `migrate-db.yml`): invariati.
- **I link fra i riepiloghi delle run** (Build & Deploy → Tag → Promote):
  rimandati dall'utente, vedi [Alternative scartate](#alternative-scartate).

## Requisiti

### Promote (dalla 006)

| # | Requisito | Test |
|---|---|---|
| P1 | Promote ha tre input booleani `deploy_backend`, `deploy_frontend`, `deploy_authorizer`, **predefiniti a `true`**: decidono *quali* componenti si deployano | run manuale: il modulo *Run workflow* mostra le tre checkbox selezionate |
| P2 | Per un componente selezionato con il campo versione **vuoto**, Promote usa l'**ultima versione taggata** di quello scope: il tag `<scope>-vX.Y.Z` con la versione semantica più alta | run con i tre campi versione vuoti: nel riepilogo le versioni sono le ultime taggate |
| P3 | L'ordinamento è **semantico**, non alfabetico: con `backend-v2.6.0` e `backend-v2.10.0` sceglie `2.10.0` | run sul repo attuale, che ha esattamente questi due tag: il riepilogo indica `2.10.0` per il backend |
| P4 | Sono considerati solo i tag della forma esatta `<scope>-vX.Y.Z` (stessa regex che usa Tag per riconoscere un tag di versione): `backend-main-*` e qualunque altro tag sono ignorati | lettura dello step di `validate` e run con campi vuoti: nessun tag `*-main-*` compare come versione scelta |
| P5 | Per un componente selezionato con il campo versione **valorizzato**, Promote usa quella versione e verifica che il tag esista, come oggi | run con una versione esistente (deploya quella) e run con una versione inesistente (`validate` fallisce) |
| P6 | Un componente **non selezionato** non viene deployato, **anche se** il suo campo versione è valorizzato; in quel caso il riepilogo lo segnala ("versione ignorata: componente non selezionato") | run con la checkbox del frontend tolta e una versione scritta nel suo campo: il frontend non si deploya e il riepilogo lo segnala |
| P7 | Se nessun componente è selezionato, `validate` fallisce con un errore esplicito prima di qualunque deploy | run con le tre checkbox tolte: `validate` fallisce, nessun job di deploy parte |
| P8 | Se un componente selezionato con versione vuota **non ha nessun tag** `<scope>-vX.Y.Z`, `validate` fallisce con un errore che dice di lanciare prima Tag (non lo salta in silenzio: chi lancia si aspetta che venga deployato) | lettura dello step di `validate`: il ramo "nessun tag trovato" termina con `exit 1` e un messaggio che nomina Tag |
| P9 | A fine `validate`, Promote scrive nel **riepilogo della run** una tabella con una riga per scope: selezionato sì/no, versione, origine (`indicata` / `ultima taggata`), link alla Release | run qualsiasi: la pagina della run mostra la tabella con tre righe |
| P10 | Rifiuto di `development`, migrazioni prima dei deploy e ordine dei job restano quelli di oggi; le condizioni dei job di deploy passano da "versione valorizzata" a "componente selezionato" | lettura del diff di `promote.yml` e run su un club: `migrate-db` gira prima dei `deploy-*` |
| P11 | Una versione indicata a mano deve avere la forma esatta `X.Y.Z`, solo cifre (`^[0-9]+\.[0-9]+\.[0-9]+$`); altrimenti `validate` fallisce con un errore che indica il formato atteso, **prima** di cercare il tag. Valori come `2.*`, `v2.10.0` o `2.10` sono rifiutati | run con versione `2.*` e run con versione `v2.10.0`: entrambe falliscono in `validate` con il messaggio sul formato |
| P12 | Negli step di `validate` gli input arrivano allo script come variabili d'ambiente (`env:`), mai interpolati con `${{ inputs.* }}` dentro `run:`: quello che si scrive nel modulo resta un dato e non diventa codice bash | lettura del diff: nessun `${{ inputs.` dentro i blocchi `run:` di `promote.yml` |

### Tag

| # | Requisito | Test |
|---|---|---|
| T1 | Il job `tag` di `tag.yml` non dichiara più `environment:` (dalla 006) | lettura del diff di `tag.yml` |
| T2 | Tag continua a promuovere come oggi: stessi tag di versione, stesse immagini, stesse Release. Anche la pulizia di `main` resta quella di oggi (T5) (dalla 006) | run di Tag su `main` dopo la modifica: riepilogo con le stesse colonne ed esiti di prima |
| T3 | Una run di Tag non compare più fra i deployment dell'Environment `development` (dalla 006) | dopo una run di Tag: Settings → Environments → `development`, nessun deployment nuovo |
| T4 | Tag lanciato da un branch diverso da `main` fallisce al primo step, prima di qualunque tag o Release, con un errore che dice di lanciarlo da `main` | lettura del primo step di `tag.yml`; nella pipeline il job di Tag non parte nemmeno fuori da `main` (W2), quindi il controllo resta come difesa se un altro workflow lo chiamasse da un altro branch |
| T5 | Dopo ogni promozione riuscita, Tag continua a ripulire i tag provvisori di `main` (Git e immagini) degli scope promossi, tenendo solo il più recente per scope, come oggi (`branch=main`, `preserve_latest=true`). Con il workflow unico lo fa la run della pipeline, dopo il job di Tag | run di Tag su `main` che promuove almeno uno scope: parte la run di Cleanup build tags e nel suo riepilogo resta un solo `<scope>-main-*` per scope promosso |

### Cleanup build tags

| # | Requisito | Test |
|---|---|---|
| C1 | Per ciascuno scope, il tag più recente `<scope>-main-*` (Git e immagine Docker) **non viene mai eliminato**, qualunque sia `preserve_latest` e con `branch` vuoto o `branch=main` | run manuale con `branch` vuoto, `preserve_latest=false`, `dry_run=true`: nel riepilogo l'ultimo `<scope>-main-*` di ogni scope è fra i mantenuti, non fra gli eliminati |
| C2 | Per gli altri branch il comportamento di `preserve_latest` resta quello di oggi: `true` tiene il più recente per scope e branch, `false` elimina tutto | run manuale con `branch=<un branch feature con più tag>` e `dry_run=true`, una volta con `preserve_latest=true` e una con `false`: confronto dei due riepiloghi |
| C3 | Con `preserve_latest=false` gli altri tag di `main` (i più vecchi) restano eliminabili come oggi: la protezione riguarda solo il più recente | run manuale con `branch=main`, `preserve_latest=false`, `dry_run=true`: nel riepilogo i `<scope>-main-*` più vecchi sono fra gli eliminati, il più recente fra i mantenuti |
| C4 | Il riepilogo segnala la protezione: il tag di `main` tenuto per C1 compare fra i "Tag mantenuti" con la dicitura "baseline di main", e l'avviso finale di `preserve_latest=false` non dice più che `main` resta senza baseline | run manuale con `branch` vuoto e `preserve_latest=false`: pagina della run |
| C5 | Il workflow parte da solo quando un **branch** viene cancellato su GitHub (evento `delete` con `ref_type=branch`): ripulisce quel branch, tutti e tre gli scope, `preserve_latest=false`, `dry_run=false` | dopo il merge in `main`: creare un branch `feature/prova-cleanup`, fare un push che lancia Build & Deploy, cancellare il branch su GitHub, controllare che la run di Cleanup build tags parta e che il riepilogo elenchi i tag e le immagini di quel branch come eliminati |
| C6 | La cancellazione di un **tag** (`ref_type=tag`) non lancia nessuna pulizia, e la cancellazione di `main` non ne lancia nessuna | lettura del diff: condizione su `github.event.ref_type == 'branch'` e sul nome del branch diverso da `main` |
| C7 | L'attivazione manuale resta com'è: stessi quattro input, stessi predefiniti (`preserve_latest=true`, `dry_run=true`) | run manuale: il modulo *Run workflow* mostra gli stessi quattro campi con gli stessi valori predefiniti |
| C8 | Gli input e il nome del branch arrivano agli script come variabili d'ambiente (`env:`), mai interpolati con `${{ … }}` dentro `run:`. Il nome di un branch cancellato lo sceglie chiunque possa fare push, e un nome di branch può contenere caratteri come `$`, `(` e `;` | lettura del diff: nessun `${{ inputs.` né `${{ github.event.` dentro i blocchi `run:` di `cleanup-build-tags.yml` |
| C9 | Con `branch` indicato si ripuliscono solo i tag di quel branch esatto: `branch=main` non prende i tag di un branch `main-qualcosa`, che il pattern `<scope>-main-*` includerebbe | run manuale con `branch=main` e `dry_run=true` in un repo con un tag `<scope>-main-prova-*`: quel tag non compare nel riepilogo |

### Build & Deploy

| # | Requisito | Test |
|---|---|---|
| B1 | `cleanup-registry` non elimina mai l'immagine a cui punta il tag più recente `<scope>-main-*` di ciascuno scope, anche se è fuori dalle 3 più recenti | run di Build & Deploy su un branch feature con più di 3 immagini non di release nel registry: nel log l'immagine dell'ultimo `<scope>-main-*` compare come mantenuta |
| B2 | Per tutto il resto `cleanup-registry` resta com'è: soglia di 3, immagini con un tag `X.Y.Z` sempre escluse | lettura del diff del job `cleanup-registry` |
| B3 | Quando un branch non ha ancora tag `<scope>-<branch>-*` propri, l'analisi delle modifiche usa come baseline l'ultimo `<scope>-main-*` contenuto nel branch (`git tag --merged HEAD`): builda e deploya solo gli scope cambiati da lì. Gli altri non si deployano e restano in `development` con l'immagine che hanno | primo push di un branch feature che modifica solo il frontend: nel log dello step "Analizza modifiche" il diff è calcolato rispetto a `frontend-main-*`, e partono build e deploy del solo frontend |
| B4 | Se nel branch non c'è nemmeno un `<scope>-main-*` (per esempio perché il branch è stato aperto prima dell'ultimo tag di `main` e quelli più vecchi sono stati ripuliti), quello scope si builda e deploya per intero, come oggi | lettura del diff dello step "Analizza modifiche": il ramo senza nessun tag resta "prima build, eseguo tutto" |
| B5 | Su un branch senza tag propri, uno scope cambiato rispetto alla baseline di `main` si builda e deploya per intero, anche se è cambiato solo il manifest: il branch non ha ancora un'immagine sua da riusare, e dare all'immagine di `main` un tag del branch ne farebbe un alias, che la pulizia alla cancellazione del branch eliminerebbe insieme all'immagine di `main` (l'API cancella per digest) | primo push di un branch feature che modifica solo `backend/k8s/`: nel log di "Analizza modifiche" compare "cambiato rispetto a main, prima build sul branch" e partono build e deploy del backend |
| B6 | Il job `test`, su un branch che non ha ancora buildato backend o authorizer, usa l'immagine dell'ultimo `<scope>-main-*` contenuto nel branch invece di fallire | primo push di un branch feature che modifica solo il frontend: nello step "Determina le immagini da provare" backend e authorizer sono i tag di data dell'ultimo `backend-main-*` e `authorizer-main-*` |

### Workflow unico

| # | Requisito | Test |
|---|---|---|
| W1 | Build & Deploy diventa la **pipeline** unica (`build-deploy.yml`, nome visibile *Pipeline*): stesso trigger (push e manuale con `force_all`), stessi job di build, test, deploy in `development` e registrazione dei tag. In coda, solo su `main`, si aggiungono i job di approvazione, Tag e Promote | push in `main`: nella pagina della run, dopo i job di deploy, compaiono "Approva Tag", "Tag" e i rami dei club |
| W2 | I job di approvazione, Tag e Promote partono solo se la run è su `main`, nessun job precedente è fallito e la run ha deployato almeno uno scope in `development`. Su un branch feature, o con una run che non ha cambiato niente, la pipeline finisce dopo il deploy come oggi | push su un branch feature: nessun job di approvazione; push in `main` che cambia solo un file fuori dagli scope: la run finisce dopo `versions` |
| W3 | **Approva Tag**: un job che dichiara l'Environment `approvazione-tag` (con *required reviewers*, nessun secret) e si ferma finché qualcuno non approva. Approvato, parte il job **Tag**, che chiama `tag.yml` | push in `main`: la run si ferma su "Approva Tag" con il pulsante *Review deployments*; dopo l'approvazione Tag gira e scrive il suo riepilogo |
| W4 | Dopo Tag, un **ramo per club**: l'elenco dei club è la Variable di repository `CLUBS`, un array JSON di nomi di Environment (es. `["club-roma","club-milano"]`). Ogni ramo chiama `promote.yml` per quel club con i tre componenti selezionati e le versioni vuote (= ultime taggate) | con `CLUBS` di due club: dopo Tag compaiono due rami "Promote (club-…)" |
| W5 | Ogni ramo si ferma su un'approvazione propria, l'Environment `approvazione-<club>`, come primo job di `promote.yml`: approvare un club deploya solo quel club. I rami sono indipendenti: rifiutare o lasciare in attesa un club non blocca gli altri | con due club: approvare solo il primo; il primo si deploya, il secondo resta in attesa |
| W6 | Il job di approvazione verifica, prima di lasciar proseguire, che il suo Environment abbia davvero un revisore obbligatorio, e altrimenti fallisce. GitHub crea al volo, **senza protezioni**, un Environment che non esiste: un club aggiunto a `CLUBS` senza il suo `approvazione-<club>` verrebbe deployato senza chiedere niente | `CLUBS` con un club senza Environment di approvazione: il ramo fallisce nel job di approvazione con un errore che dice di configurarlo, e Promote non parte |
| W7 | Un nuovo push in `main` annulla le approvazioni ancora in attesa delle run precedenti (`concurrency` con `cancel-in-progress` sui job di approvazione, un gruppo per Tag e uno per club): resta in attesa solo la run più recente, che promuove comunque l'ultimo stato di `main` | due push in `main` senza approvare il primo: le attese della prima run risultano annullate, quelle della seconda restano |
| W8 | Se Tag non ha niente di nuovo da promuovere, i rami dei club partono lo stesso e deployano le ultime versioni taggate | run in cui Tag segna tutti gli scope "già promosso": i rami dei club si fermano comunque sulla loro approvazione |
| W9 | `rilascio.yml` viene eliminato. Tag resta solo `workflow_call`, chiamato dalla pipeline. Promote resta lanciabile a mano, senza nessuna approvazione, per un rollback, una versione specifica, un solo componente o un club non in `CLUBS`, ed è riutilizzabile (`workflow_call`) con in più l'input dell'Environment di approvazione | tab Actions: niente Rilascio né Tag, Promote con *Run workflow*; una run manuale di Promote non si ferma su nessuna approvazione |
| W10 | Il riepilogo della pipeline, a fine deploy su `main`, dice che la run attende l'approvazione di Tag e poi dei club, con l'elenco dei club | push in `main`: la pagina della run mostra la riga sull'attesa |

### Documentazione

| # | Requisito | Test |
|---|---|---|
| D1 | `.github/README.md` (sezioni `promote.yml`, `tag.yml`, `cleanup-build-tags.yml`, `cleanup-registry`, analisi delle modifiche di Build & Deploy, pattern 5 e pattern sulla pulizia, tabella dei workflow) e `docs/readme/pipeline-ci-cd.md` (sezioni Build & Deploy, Tag, Promote, Cleanup build tags) descrivono il nuovo comportamento e il flusso di riferimento; i commenti in testa ai workflow toccati dicono lo stesso | lettura delle sezioni elencate nei due file |
| D2 | In `docs/readme/pipeline-ci-cd.md` sono corrette le due inesattezze già presenti: l'Environment chiamato `dev` (è `development`) e i tag `server-v`/`client-v`/`auth-v` (sono `backend-v`/`frontend-v`/`authorizer-v`) (dalla 006) | ricerca di `dev` come nome di Environment e di `server-v`, `client-v`, `auth-v` nel file: nessun risultato |
| D3 | `docs/readme/variabili-e-secret.md` non dice più che Tag legge l'Environment `development` (dalla 006) | lettura del paragrafo iniziale del file |
| D4 | `docs/developer/operazioni-cluster.md`, rotazione della chiave: "compilando **solo** `authorizer_version`" diventa "togliendo backend e frontend" (dalla 006) | lettura della sezione sulla rotazione della chiave |
| D5 | La pipeline e le approvazioni sono descritte in `.github/README.md` e `docs/readme/pipeline-ci-cd.md` (flusso, come si approva, cosa succede a un rifiuto); la configurazione una tantum (Environment `approvazione-tag` e `approvazione-<club>`, Variable `CLUBS`) è in `docs/readme/variabili-e-secret.md`, passo per passo; nessun documento nomina più `Rilascio` | lettura dei tre file e ricerca di "Rilascio": nessun risultato |

Chi è coinvolto: chi gestisce i rilasci, dalla tab Actions di GitHub. Nessun
ruolo applicativo (socio, istruttore, admin) è toccato.

## Workflow unico

Richiesto dall'utente il 2026-10-14 e definito il 2026-10-16: **una sola run**
che parte dal push in `main`, builda e deploya in `development` come oggi, poi
si ferma per un'approvazione prima di Tag e per una, per ciascun club, prima di
Promote. Il 2026-10-16 era stato implementato un workflow manuale `Rilascio`
(Tag e poi Promote, lanciato a mano); l'utente ha chiarito che non era la forma
voluta.

Come funzionano le approvazioni in GitHub Actions:

- l'unico modo di fermare una run in attesa di una persona è un job che
  dichiara un Environment con *required reviewers*. Nella pagina della run
  compare *Review deployments*: si approva o si rifiuta, e solo allora il job
  parte. Un'attesa scade dopo 30 giorni;
- l'approvazione vale **per job**: in Promote `migrate-db` e i tre `deploy-*`
  dichiarano ciascuno l'Environment del club, quindi un revisore sull'Environment
  del club chiederebbe quattro approvazioni per club. Per questo le approvazioni
  stanno su Environment **dedicati e vuoti** (`approvazione-tag`,
  `approvazione-<club>`), senza secret, e gli Environment dei club restano
  senza revisori;
- le approvazioni sugli Environment sono disponibili in tutti i piani sui
  repository **pubblici**; su un repository privato dipendono dal piano
  (secondo quanto ricordato in fase di analisi, solo Enterprise: **da
  verificare** in Settings → Environments, dove compare o no l'opzione
  *Required reviewers*). L'utente ha detto il 2026-10-16 che può rendere
  pubblico il repository se serve.

Configurazione una tantum (da fare a mano, documentata in
[variabili-e-secret.md](../docs/readme/variabili-e-secret.md)):

- Environment `approvazione-tag` e, per ogni club, `approvazione-<club>`: un
  revisore obbligatorio (l'utente), *Prevent self-review* disattivato (chi fa
  il push deve poter approvare la propria run), *Deployment branches* limitato
  a `main`;
- Variable di repository `CLUBS` con l'elenco dei club da proporre a ogni
  rilascio.

### Decisioni prese

| # | Domanda | Scelta |
|---|---|---|
| WD1 | Forma del workflow | Pipeline automatica su ogni push in `main`, con approvazione prima di Tag e prima di Promote. Decisione dell'utente del 2026-10-16 |
| WD2 | Club per run | Tutti quelli di `CLUBS`, con un'approvazione per club. Decisione dell'utente del 2026-10-16 (scheda di decisione) |
| WD3 | Cosa resta di Tag e Promote | Tag solo `workflow_call`; Promote lanciabile anche a mano; `Rilascio` eliminato |
| WD4 | Se Tag non ha niente di nuovo | I rami dei club partono lo stesso (W8): serve a portare un rilascio già fatto in un club non ancora aggiornato |
| WD5 | Dove sta la pipeline | Nel file di Build & Deploy, rinominato *Pipeline*: un solo workflow, e i job di build e deploy restano quelli di oggi |

## Modello dati

Nessuna variazione di schema.

## API

Nessun endpoint nuovo o modificato.

## Interfaccia

Nessuna pagina dell'applicazione. Le "interfacce" sono due, su GitHub:

- il pulsante **Review deployments** nella pagina della run della pipeline:
  prima "approvazione-tag", poi un "approvazione-<club>" per ciascun club;
- il modulo **Run workflow** di Promote lanciato a mano (dalla 006):

| Campo | Tipo | Predefinito |
|---|---|---|
| `environment` | menu degli Environment | — (obbligatorio) |
| `deploy_backend` | checkbox | ✔ |
| `backend_version` | testo, facoltativo | vuoto = ultima taggata |
| `deploy_frontend` | checkbox | ✔ |
| `frontend_version` | testo, facoltativo | vuoto = ultima taggata |
| `deploy_authorizer` | checkbox | ✔ |
| `authorizer_version` | testo, facoltativo | vuoto = ultima taggata |

Caso della rotazione della chiave di firma
([operazioni-cluster.md](../docs/developer/operazioni-cluster.md)): Promote a
mano, togliendo le checkbox di backend e frontend.

Il modulo di Cleanup build tags resta identico; cambia il riepilogo (C4).

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| Separare "quali componenti" da "quale versione" | Checkbox per scope + campo versione facoltativo | Con "vuoto = ultima" il campo vuoto non può più voler dire anche "non deployare": serve un secondo segnale. Le checkbox sono visibili nel modulo e non richiedono di ricordare un valore speciale |
| Checkbox predefinite | Tutte selezionate | Il caso frequente è "porta il rilascio nel club": deve bastare scegliere l'ambiente |
| Cosa vuol dire "ultima" | Versione semantica più alta (`git tag --sort=-v:refname`) | È quello che una persona intende per "ultima versione". La data di creazione no: Tag può spostare un tag esistente (`git tag -f`), e un tag vecchio rispostato risulterebbe il più recente. L'alfabetico no: metterebbe `2.6.0` sopra `2.10.0`, che nel repo esistono davvero |
| Componente selezionato senza nessun tag | Errore in `validate` | Saltarlo in silenzio lascerebbe il club con un componente non aggiornato senza che nessuno lo noti; un errore chiede di togliere la checkbox o di lanciare Tag |
| Versione scritta su un componente non selezionato | Ignorata, segnalata nel riepilogo | La checkbox è la decisione esplicita; un fallimento per un campo dimenticato sarebbe pignolo, il silenzio confonderebbe |
| Formato della versione indicata a mano | Validato con una regex prima di cercare il tag | Oggi il controllo non basta: `git tag -l` tratta l'input come pattern glob e `grep -x` come regex, quindi `2.*` trova `backend-v2.10.0` e passa. L'errore arriva solo dopo, quando le migrazioni o il deploy cercano un'immagine `:2.*` che non esiste |
| Input negli script | Passati con `env:`, in Promote e in Cleanup build tags | `${{ … }}` viene sostituito come testo prima che bash parta: un valore come `1.0.0"; comando; echo "` verrebbe eseguito con i secret del job. In Cleanup il rischio è più concreto, perché il nome del branch cancellato lo sceglie chi fa push |
| Environment di Tag | Nessuno | Tag non legge Variables né secret di Environment: legarlo a uno gli dà accesso a secret che non usa e registra deployment falsi |
| Tag solo da `main` | Controllo esplicito al primo step, che fallisce | Un errore spiega cosa è successo; un job saltato in silenzio (`if:` sul job) lascerebbe credere che Tag abbia girato senza trovare nulla |
| Protezione di `main` | Sempre attiva, indipendente da `preserve_latest` | `main` non si chiude mai: un tag di `main` che sparisce rompe sempre il diff e Tag. Lasciarla a un input significa affidarla a chi lancia il workflow |
| Cosa si protegge di `main` | Solo il tag più recente per scope | È l'unico che Build & Deploy e Tag leggono; i più vecchi restano eliminabili |
| Quando ripulire un branch | Alla sua cancellazione su GitHub (evento `delete`) | Nel flusso di riferimento la cancellazione è il segno che il branch è chiuso. L'evento porta il nome del branch, funziona sia con il merge da PR sia con il merge in locale seguito da `git push origin --delete` |
| Come ripulirlo | Per intero: tutti gli scope, `preserve_latest=false`, `dry_run=false` | Un branch cancellato non avrà più build: nessuno dei suoi tag serve |
| Pulizia di `main` dopo Tag | Mantenuta: a ogni promozione si tengono solo i tag `<scope>-main-*` più recenti | Dopo un nuovo tag i tag provvisori di `main` non servono più, tranne l'ultimo per scope: è quello che gira in `development` e la baseline del prossimo diff. Decisione dell'utente del 2026-10-16, che supera quella del 2026-10-14 di togliere il trigger |
| Branch cancellato solo in locale | Nessuna pulizia automatica, e non si documenta | Resta la pulizia manuale. Decisione dell'utente del 2026-10-16 |
| Prima build di un branch feature | Baseline sull'ultimo `<scope>-main-*` contenuto nel branch | Dopo il merge in `development` non resta in uso nessuna immagine del branch, quindi la pulizia alla cancellazione non può toglierne una in uso. Non dipende da come si fa il merge, non tocca le versioni già rilasciate, e il branch feature builda meno. Decisione dell'utente del 2026-10-16 |

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| Workflow manuale **Rilascio** (Tag e poi Promote in un club scelto al lancio), con Build & Deploy separato | Implementato il 2026-10-16 e scartato lo stesso giorno dall'utente: voleva una sola run con avanzamento a step approvati, non due workflow. Le run in attesa, motivo per cui la pipeline era stata scartata nella 006, si limitano con W7 |
| Revisore sull'Environment di ciascun club, senza Environment di approvazione dedicati | L'approvazione vale per job: `migrate-db` e i tre `deploy-*` dichiarano ciascuno l'Environment del club, quindi quattro approvazioni per club |
| Un solo Environment di approvazione per tutti i club | In *Review deployments* si approva per Environment: tutti i rami in attesa sullo stesso Environment partirebbero insieme, e non si potrebbe scegliere il club |
| Approvazione per club come job separato prima della chiamata a Promote | Il job di Promote di un club dovrebbe dipendere dal job di approvazione dello stesso club, ma una dipendenza fra job a matrice aspetta **tutti** i club: approvarne uno non basterebbe. Con l'approvazione dentro `promote.yml` ogni ramo è indipendente |
| Pulsante nel riepilogo che lancia Tag o Promote con gli input già compilati | Non esiste in GitHub Actions: nel riepilogo si possono mettere solo testo e link, e `workflow_dispatch` non accetta input precompilati da un URL. Proposto dall'utente il 2026-10-14 |
| Link nel riepilogo di Build & Deploy alla pagina di Tag, e in quello di Tag alla pagina di Promote | Fattibile (sono solo link, senza input), ma rimandato dall'utente il 2026-10-14: per ora non serve. Con un workflow unico perderebbe comunque senso |
| Tag che a fine run lancia Promote da sé (`gh workflow run`) | L'ambiente andrebbe deciso prima, e lanciare Tag non significa voler aggiornare un club adesso: taggare e deployare hanno cicli di vita diversi ([.github/README.md](../.github/README.md#5-tag-e-promote-separati)). La pipeline risolve la stessa esigenza con le approvazioni |
| Valore speciale nel campo versione (es. `-`) per "non deployare" | Un codice da ricordare, invisibile nel modulo; le checkbox dicono la stessa cosa a chi guarda |
| "Vuoto = non deployare" come oggi, con un'unica checkbox "usa le ultime versioni" | Due modi di dire la stessa cosa, e con la checkbox attiva non si potrebbe deployare un solo componente all'ultima versione (caso della rotazione della chiave) |
| Promote che legge `/version` del club e salta i componenti già allineati | Il runner dipenderebbe dalla raggiungibilità del club, per risparmiare un rollout che è comunque innocuo |
| Lasciare `environment: development` su Tag come gate | Il gate sta su un Environment dedicato senza secret (`approvazione-tag`), non su `development` |
| Pulizia su `pull_request` chiusa e mergiata (`github.head_ref`) | Nel repository si fa anche il merge in locale (es. `44c90f7 Merge branch 'feature/spec-005'`): senza PR l'evento non parte |
| Pulizia sul push in `main`, ricavando il branch dal messaggio "Merge branch '…'" | Un merge fast-forward non ha un commit di merge, uno squash ha un altro messaggio: il nome del branch non è affidabile |
| Pulizia sul push in `main` per qualunque branch già mergiato (`git branch -r --merged`) | Ripulirebbe anche un branch mergiato ma ancora in uso. La cancellazione è una decisione esplicita, il merge no |
| Togliere da Tag la pulizia di `main` | Proposta dall'utente il 2026-10-14 e ritirata il 2026-10-16: senza, i tag provvisori di `main` si accumulano, e nessun altro evento li ripulisce |
| Proteggere `main` cambiando solo il predefinito o la descrizione di `preserve_latest` | È il problema di oggi: la protezione dipende da chi compila il modulo |
| Al merge su `main`, rideployare tutti gli scope | Proposta dall'utente il 2026-10-16, scartata per la baseline di `main` (B3). Il merge si riconosce solo da un commit di merge, non con fast-forward o squash; e uno scope invariato riceverebbe un `<scope>-main-*` su un commit nuovo (tag nuovo se ribuildato, tag spostato in avanti se solo rideployato), quindi Tag lo ripromuoverebbe con la stessa versione, spostando il tag `X.Y.Z` già rilasciato e, con il rebuild, creando un'immagine nuova per lo stesso codice (regola 5 di AGENTS.md) |
| Lasciare il problema e documentare un Build & Deploy con `force_all` su `main` quando un pod va in `ImagePullBackOff` | Il guasto si vedrebbe solo al riavvio di un pod, lontano dalla causa |

## Rischi e impatti

- **Piano GitHub.** Se il piano non permette i revisori su un repository
  privato, le approvazioni non si possono configurare: il job di approvazione
  fallisce (W6) e niente viene deployato nei club senza consenso, ma la pipeline
  non arriva mai a Tag. In quel caso il repository va reso pubblico (l'utente
  è d'accordo) o si torna a un workflow manuale.
- **Run segnate come fallite.** Un'approvazione rifiutata fa fallire quel ramo,
  e la run risulta fallita anche se tutto il resto è andato bene; lo stesso per
  le attese annullate da un push successivo (W7), che risultano annullate.
  È il comportamento di GitHub e non si può cambiare.
- **Da verificare nel test**: che `cancel-in-progress` annulli anche un job
  fermo in attesa di approvazione (W7). Se non lo fa, le attese vecchie
  restano finché non si rifiutano a mano o scadono dopo 30 giorni.

- **Branch aperto prima dell'ultimo Tag.** La pulizia dopo Tag tiene solo
  l'ultimo `<scope>-main-*`: se un branch è stato aperto prima di quel tag e
  fa il primo push dopo, nel branch non c'è più nessun tag di `main` e la
  prima build torna a buildare e deployare tutto (B4), come oggi.

- **Cambio di comportamento di Promote con tutti i campi vuoti** (dalla 006).
  Oggi Promote con le tre versioni vuote fallisce ("Specifica almeno una…");
  dopo deploya tutti e tre i componenti all'ultima versione. È voluto, ma chi
  lancia Promote "per provare" senza compilare nulla oggi non rischia niente e
  domani aggiorna il club. Il riepilogo (P9) e il titolo del modulo lo rendono
  visibile.
- **Run di Promote lanciate con i vecchi input** (da script o da un `gh workflow
  run` salvato): gli input esistenti restano con lo stesso nome; chi passava
  una sola versione otterrebbe però anche gli altri due componenti, perché le
  checkbox valgono `true`. Nel repo non c'erano chiamate a `promote.yml` da
  altri workflow (verificato: era solo `workflow_dispatch`). Con la pipeline
  lo chiama la pipeline, sempre con tutti e tre i componenti.
- **Tag senza Environment**: se l'Environment `development` avesse una
  *deployment branch policy* o dei reviewer, Tag ne uscirebbe. **Verificato
  dall'utente il 2026-10-14**: `development` non ha né branch policy né
  reviewer, quindi togliere l'Environment non toglie protezioni. Il limite a
  `main` lo dà T4.
- **Il trigger della pulizia si prova solo dopo il merge.** GitHub lancia un
  workflow sull'evento `delete` solo se il file è nel branch predefinito: C5
  non è verificabile dal branch della spec, ma solo dopo il merge in `main`,
  con un branch di prova.
- **Una cancellazione per errore** di un branch ancora attivo ne ripulisce
  tutti i tag: la build successiva, se il branch viene ricreato, ribuilda e
  rideploya tutto. È lo stesso effetto della pulizia manuale con
  `preserve_latest=false` di oggi, e non tocca `main` (C1).
- **Test**: la suite `tests/api/` non copre la pipeline e non c'è modo di
  esercitare un workflow GitHub da lì; la regola 4 di AGENTS.md non si applica.
  La verifica è per run manuali, elencate nella colonna Test.

## Test dell'utente

*Da compilare.*

## Verifica

*Da compilare dopo il test dell'utente.*

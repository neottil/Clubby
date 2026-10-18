# 006 — Promote con le ultime versioni, Tag senza Environment

> **Confluita nella [009](009-pipeline-di-rilascio.md)** il 2026-10-14, per
> decisione dell'utente: requisiti, decisioni e alternative scartate sono
> riportati lì, ed è lì che si lavorano. Questo file resta come storico; il
> numero 006 non si riusa.

> Due ritocchi alla pipeline, decisi insieme mentre si valutava di concatenare
> Build & Deploy, Tag e Promote in un'unica run (scartato: vedi
> [Alternative scartate](#alternative-scartate)). I workflow restano separati e
> manuali; cambia solo quanto bisogna scrivere per lanciarli.

## Stato

- [x] Draft
- [ ] Approvata
- [ ] In test (utente)
- [ ] Completata

**Versioni**: nessun modulo. Si toccano solo `.github/workflows/` e la
documentazione: backend, frontend e authorizer non cambiano, e alzarne la
versione produrrebbe tag su immagini identiche alle precedenti (regola 5 di
AGENTS.md).

## Problema

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

## Obiettivo

Lanciare Promote scegliendo **solo il club**, e ottenere in quel club le ultime
versioni taggate di backend, frontend e authorizer; restano possibili, come
oggi, una versione specifica e il deploy di un solo componente. Tag non è più
legato a nessun Environment.

## Fuori perimetro

- **Concatenare i workflow.** Build & Deploy, Tag e Promote restano tre
  workflow manuali distinti (Build & Deploy automatico sui push, come oggi).
- **La logica di Tag**: cosa promuove, come sceglie il commit, la pulizia dei
  tag. Cambia solo la riga `environment:`.
- **Sapere cosa gira già nel club.** Promote non legge `/api/version` del club
  per saltare i componenti già allineati: rideployare la stessa versione è
  innocuo (il rollout non cambia nulla, le migrazioni già applicate si
  saltano), e il runner non deve dipendere dalla raggiungibilità del club.
- **Build & Deploy, Infra, i workflow di deploy riutilizzabili**: invariati.

## Requisiti

### Promote

| # | Requisito | Verifica |
|---|---|---|
| P1 | Promote ha tre input booleani `deploy_backend`, `deploy_frontend`, `deploy_authorizer`, **predefiniti a `true`**: decidono *quali* componenti si deployano | run manuale |
| P2 | Per un componente selezionato con il campo versione **vuoto**, Promote usa l'**ultima versione taggata** di quello scope: il tag `<scope>-vX.Y.Z` con la versione semantica più alta | run con campi vuoti |
| P3 | L'ordinamento è **semantico**, non alfabetico: con `backend-v2.6.0` e `backend-v2.10.0` sceglie `2.10.0` | run sul repo attuale, che ha esattamente questi due tag |
| P4 | Sono considerati solo i tag della forma esatta `<scope>-vX.Y.Z` (stessa regex che usa Tag per riconoscere un tag di versione): `backend-main-*` e qualunque altro tag sono ignorati | lettura dello step, run |
| P5 | Per un componente selezionato con il campo versione **valorizzato**, Promote usa quella versione e verifica che il tag esista, come oggi | run con versione esplicita, run con versione inesistente |
| P6 | Un componente **non selezionato** non viene deployato, **anche se** il suo campo versione è valorizzato; in quel caso il riepilogo lo segnala ("versione ignorata: componente non selezionato") | run con checkbox tolta e versione scritta |
| P7 | Se nessun componente è selezionato, `validate` fallisce con un errore esplicito prima di qualunque deploy | run con le tre checkbox tolte |
| P8 | Se un componente selezionato con versione vuota **non ha nessun tag** `<scope>-vX.Y.Z`, `validate` fallisce con un errore che dice di lanciare prima Tag (non lo salta in silenzio: chi lancia si aspetta che venga deployato) | lettura dello step |
| P9 | A fine `validate`, Promote scrive nel **riepilogo della run** una tabella con una riga per scope: selezionato sì/no, versione, origine (`indicata` / `ultima taggata`), link alla Release | run, pagina della run |
| P10 | Rifiuto di `development`, migrazioni prima dei deploy e ordine dei job restano quelli di oggi; le condizioni dei job di deploy passano da "versione valorizzata" a "componente selezionato" | lettura del diff, run |
| P11 | Una versione indicata a mano deve avere la forma esatta `X.Y.Z`, solo cifre (`^[0-9]+\.[0-9]+\.[0-9]+$`); altrimenti `validate` fallisce con un errore che indica il formato atteso, **prima** di cercare il tag. Valori come `2.*`, `v2.10.0` o `2.10` sono rifiutati | run con versione `2.*` e run con versione `v2.10.0` |
| P12 | Negli step di `validate` gli input arrivano allo script come variabili d'ambiente (`env:`), mai interpolati con `${{ inputs.* }}` dentro `run:`: quello che si scrive nel modulo resta un dato e non diventa codice bash | lettura del diff: nessun `${{ inputs.` dentro i blocchi `run:` di `promote.yml` |

### Tag

| # | Requisito | Verifica |
|---|---|---|
| T1 | Il job `tag` di `tag.yml` non dichiara più `environment:` | lettura del diff |
| T2 | Tag continua a funzionare identico: stessi tag, stesse immagini, stesse Release, stessa pulizia | run di Tag dopo la modifica |
| T3 | Una run di Tag non compare più fra i deployment dell'Environment `development` | Settings → Environments / pagina Deployments |

Chi è coinvolto: chi gestisce i rilasci, dalla tab Actions di GitHub. Nessun
ruolo applicativo (socio, istruttore, admin) è toccato.

## Modello dati

Nessuna variazione di schema.

## API

Nessun endpoint nuovo o modificato.

## Interfaccia

Nessuna pagina dell'applicazione. L'"interfaccia" è il modulo **Run workflow**
di Promote su GitHub:

| Campo | Tipo | Predefinito |
|---|---|---|
| `environment` | menu degli Environment | — (obbligatorio) |
| `deploy_backend` | checkbox | ✔ |
| `backend_version` | testo, facoltativo | vuoto = ultima taggata |
| `deploy_frontend` | checkbox | ✔ |
| `frontend_version` | testo, facoltativo | vuoto = ultima taggata |
| `deploy_authorizer` | checkbox | ✔ |
| `authorizer_version` | testo, facoltativo | vuoto = ultima taggata |

Caso tipico dopo un rilascio: si sceglie il club e si preme Run. Caso della
rotazione della chiave di firma ([operazioni-cluster.md](../docs/developer/operazioni-cluster.md)):
si tolgono le checkbox di backend e frontend.

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| Separare "quali componenti" da "quale versione" | Checkbox per scope + campo versione facoltativo | Con "vuoto = ultima" il campo vuoto non può più voler dire anche "non deployare": serve un secondo segnale. Le checkbox sono visibili nel modulo e non richiedono di ricordare un valore speciale |
| Checkbox predefinite | Tutte selezionate | Il caso frequente è "porta il rilascio nel club": deve bastare scegliere l'ambiente |
| Cosa vuol dire "ultima" | Versione semantica più alta (`git tag --sort=-v:refname`) | È quello che una persona intende per "ultima versione". La data di creazione no: Tag può spostare un tag esistente (`git tag -f`), e un tag vecchio rispostato risulterebbe il più recente. L'alfabetico no: metterebbe `2.6.0` sopra `2.10.0`, che nel repo esistono davvero |
| Componente selezionato senza nessun tag | Errore in `validate` | Saltarlo in silenzio lascerebbe il club con un componente non aggiornato senza che nessuno lo noti; un errore chiede di togliere la checkbox o di lanciare Tag |
| Versione scritta su un componente non selezionato | Ignorata, segnalata nel riepilogo | La checkbox è la decisione esplicita; un fallimento per un campo dimenticato sarebbe pignolo, il silenzio confonderebbe |
| Environment di Tag | Nessuno | Tag non legge Variables né secret di Environment: legarlo a uno gli dà accesso a secret che non usa e registra deployment falsi |
| Formato della versione indicata a mano | Validato con una regex prima di cercare il tag | Oggi il controllo non basta: `git tag -l` tratta l'input come pattern glob e `grep -x` come regex, quindi `2.*` trova `backend-v2.10.0` e passa. L'errore arriva solo dopo, quando le migrazioni o il deploy cercano un'immagine `:2.*` che non esiste |
| Input negli script | Passati con `env:` | `${{ … }}` viene sostituito come testo prima che bash parta: un valore come `1.0.0"; comando; echo "` verrebbe eseguito con i secret del job. Il rischio è basso (Promote lo lancia solo chi scrive sul repo, e P11 rifiuta i valori strani), ma lo step va riscritto comunque ed è la forma raccomandata da GitHub |

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| **Un'unica pipeline** Build & Deploy → Tag → Promote, con Tag e Promote dietro un gate di approvazione (Environment con *required reviewers*) | Ogni push su `main` lascerebbe una run ferma in attesa di approvazione o rifiuto, fino a 30 giorni. Scartata dall'utente: le run in sospeso sono rumore, e la maggior parte dei push non diventa un rilascio |
| Variante della precedente con un gate **per club** (matrix su una Variable con l'elenco dei club, una checkbox per club in *Review deployments*) | Stesso problema delle run in attesa, moltiplicato per club. In più l'approvazione vale per job: `migrate-db` e i tre `deploy-*` dichiarano ciascuno l'Environment, quindi 3–4 approvazioni per club senza ristrutturare i job |
| Pulsante nel riepilogo che lancia Tag o Promote con gli input già compilati | Non esiste in GitHub Actions: nel riepilogo si possono mettere solo testo e link, e `workflow_dispatch` non accetta input precompilati da un URL. Proposto dall'utente il 2026-10-14 |
| Link nel riepilogo di Build & Deploy alla pagina di Tag, e in quello di Tag alla pagina di Promote | Fattibile (sono solo link, senza input), ma rimandato dall'utente il 2026-10-14: per ora non serve. Si può riprendere in una spec a parte |
| Tag che a fine run lancia Promote da sé (`gh workflow run`) | L'ambiente andrebbe deciso prima, e lanciare Tag non significa voler aggiornare un club adesso: taggare e deployare hanno cicli di vita diversi ([.github/README.md](../.github/README.md#5-tag-e-promote-separati)) |
| Valore speciale nel campo versione (es. `-`) per "non deployare" | Un codice da ricordare, invisibile nel modulo; le checkbox dicono la stessa cosa a chi guarda |
| "Vuoto = non deployare" come oggi, con un'unica checkbox "usa le ultime versioni" | Due modi di dire la stessa cosa, e con la checkbox attiva non si potrebbe deployare un solo componente all'ultima versione (caso della rotazione della chiave) |
| Promote che legge `/version` del club e salta i componenti già allineati | Il runner dipenderebbe dalla raggiungibilità del club, per risparmiare un rollout che è comunque innocuo |
| Lasciare `environment: development` su Tag in vista di un futuro gate | Il gate è stato scartato; e se tornasse andrebbe su un Environment dedicato senza secret, non su `development` |

## Rischi e impatti

- **Cambio di comportamento con tutti i campi vuoti.** Oggi Promote con le tre
  versioni vuote fallisce ("Specifica almeno una…"); dopo deploya tutti e tre i
  componenti all'ultima versione. È voluto, ma chi lancia Promote "per provare"
  senza compilare nulla oggi non rischia niente e domani aggiorna il club. Il
  riepilogo (P9) e il titolo del modulo lo rendono visibile.
- **Run di Promote lanciate con i vecchi input** (da script o da un `gh workflow
  run` salvato): gli input esistenti restano con lo stesso nome; chi passava
  una sola versione otterrebbe però anche gli altri due componenti, perché le
  checkbox valgono `true`. Nel repo non ci sono chiamate a `promote.yml` da
  altri workflow (verificato: è solo `workflow_dispatch`).
- **Tag senza Environment**: se l'Environment `development` avesse una
  *deployment branch policy* o dei reviewer, Tag ne uscirebbe. **Verificato
  dall'utente il 2026-10-14**: `development` non ha né branch policy né
  reviewer, quindi togliere l'Environment non toglie protezioni. Tag resta
  comunque limitato a `main` per costruzione (lavora solo su tag `*-main-*`).
- **Documentazione da allineare** nello stesso passaggio:
  - [.github/README.md](../.github/README.md) — sezione `promote.yml`, pattern 5
    ("riceve la versione da deployare come input esplicito"), tabella dei
    workflow;
  - [docs/readme/pipeline-ci-cd.md](../docs/readme/pipeline-ci-cd.md) — sezioni
    Tag e Promote. Contiene anche due inesattezze già presenti, da correggere
    insieme: l'Environment chiamato `dev` e i tag `server-v`/`client-v`/`auth-v`
    (quelli veri sono `backend-v`/`frontend-v`/`authorizer-v`);
  - [docs/readme/variabili-e-secret.md](../docs/readme/variabili-e-secret.md) —
    "`Build & Deploy` e `Tag` leggono sempre l'Environment `development`";
  - [docs/developer/operazioni-cluster.md](../docs/developer/operazioni-cluster.md)
    — rotazione della chiave: "compilando **solo** `authorizer_version`"
    diventa "togliendo backend e frontend".
- **Test**: la suite `tests/api/` non copre la pipeline e non c'è modo di
  esercitare un workflow GitHub da lì; la regola 4 di AGENTS.md non si applica.
  La verifica è per run manuali, elencate nella colonna Verifica.

## Test dell'utente

*Da compilare.*

## Verifica

*Da compilare dopo il test dell'utente.*

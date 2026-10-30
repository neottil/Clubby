# 011 — Pulizia delle run dei workflow

## Stato

- [x] Draft
- [x] Approvata (Luca, 2026-10-26)
- [x] In test (utente)
- [ ] Completata

**Versioni**: nessun modulo applicativo toccato (solo workflow e documentazione).

## Problema

Ogni push su `main`, `feature/**` e `fix/**` lascia una run della Pipeline, e
Tag, Promote, Infra e Cleanup build tags ne lasciano altre. Nessuno le cancella:
la scheda Actions si riempie di run di branch chiusi da settimane e di run
vecchie di `main`, e la run che interessa (l'ultima ferma a un'approvazione,
l'ultimo rilascio) si trova scorrendo.

`cleanup-build-tags.yml` pulisce i tag Git e le immagini su ghcr.io, non le run.
L'impostazione di GitHub "Artifact and log retention" cancella i log e gli
artefatti dopo N giorni, ma la run resta nell'elenco.

## Obiettivo

Nella scheda Actions restano solo le run che servono: le ultime di ogni
workflow, lo storico dei rilasci in produzione e le run ancora aperte. Le run
dei branch chiusi spariscono con il branch.

## Fuori perimetro

- Tag Git e immagini Docker: restano compito di `cleanup-build-tags.yml`, che
  non cambia.
- La conservazione di log e artefatti (impostazione del repo su GitHub): non si
  tocca da workflow.
- Branch cancellati solo in locale: come per i tag, nessuna pulizia automatica
  finché il branch esiste su GitHub (vale la regola R2).

## Requisiti

| # | Requisito | Test |
|---|---|---|
| R1 | Un nuovo workflow `cleanup-runs.yml` ("Cleanup run") parte ogni settimana di notte (`schedule`), a mano (`workflow_dispatch`) e alla cancellazione di un branch su GitHub (`delete`, solo `ref_type == branch`, mai `main`) | Controllo manuale: le tre partenze compaiono in Actions; cancellare un tag non avvia la pulizia |
| R2 | Per ogni workflow e per ogni branch che esiste su GitHub si tengono le ultime **10** run concluse; le più vecchie si cancellano | Controllo manuale in dry run: per `main` e per un branch feature con più di 10 run, l'elenco "da cancellare" parte dall'undicesima |
| R3 | Oltre alle 10 di R2, su `main` si tengono le ultime **10 run di rilascio** della Pipeline, cioè quelle in cui il job `approva-tag` è riuscito | Controllo manuale in dry run: una run di rilascio più vecchia delle ultime 10 compare tra le mantenute con il motivo "rilascio" |
| R4 | Le run di un branch che non esiste più su GitHub si cancellano tutte: subito sull'evento `delete`, e alla pulizia settimanale per i branch cancellati prima che il workflow esistesse | Controllo manuale: cancellare un branch feature su GitHub e verificare che la sua scheda Actions resti vuota |
| R5 | Non si cancella mai una run non conclusa (`queued`, `in_progress`, `waiting`, `pending`, `requested`): comprese quelle ferme a `approvazione-tag` o a un `approvazione-<club>` | Controllo manuale in dry run con una run di `main` ferma all'approvazione: compare tra le mantenute |
| R6 | La partenza manuale ha gli input `dry_run` (default `true`), `keep` (default 10) e `keep_releases` (default 10); le partenze automatiche usano i default con `dry_run=false` | Controllo manuale: una run a mano con i default non cancella nulla e dice cosa cancellerebbe |
| R7 | Ogni run scrive un riepilogo (Step Summary) con parametri, run cancellate (o da cancellare) e run mantenute per motivo, per ciascun workflow | Controllo manuale del riepilogo di una run in dry run e di una reale |
| R8 | Una singola run cancella al massimo **500** run; quelle in eccesso restano per la run successiva, e il riepilogo lo dice | Controllo manuale alla prima esecuzione reale, se l'arretrato supera 500 |
| R9 | `.github/README.md`, `docs/readme/pipeline-ci-cd.md` e `specs/README.md` descrivono il nuovo workflow | Rilettura dei tre file |

## Modello dati

Nessuna variazione di schema.

## API

Nessun endpoint dell'applicazione. Il workflow usa l'API REST di GitHub con il
`GITHUB_TOKEN` (permesso `actions: write`, `contents: read`):

- `GET /repos/{owner}/{repo}/actions/workflows/{id}/runs` per elencare le run di
  ciascun workflow;
- `GET /repos/{owner}/{repo}/actions/runs/{id}/jobs` per riconoscere le run di
  rilascio (R3), solo per le run di `main` della Pipeline oltre le prime 10;
- `GET /repos/{owner}/{repo}/branches` per sapere quali branch esistono (R4);
- `DELETE /repos/{owner}/{repo}/actions/runs/{id}` per cancellare.

## Interfaccia

Nessuna pagina dell'applicazione. Nella scheda Actions compare il workflow
"Cleanup run".

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| Quante run tenere | Ultime 10 per workflow e per branch, più gli ultimi 10 rilasci e i branch chiusi svuotati | Scelta di Luca il 2026-10-26 tra tre opzioni; il conteggio per branch evita che i push su un feature facciano sparire le run di `main` |
| Storico dei rilasci | Ultime 10 run di rilascio della Pipeline, in più | Sono le run che dicono cosa è andato in produzione e quando; la cronologia degli Environment dei club punta a quelle run |
| Come si riconosce un rilascio | Job `approva-tag` riuscito | È il punto in cui qualcuno ha approvato il rilascio; non serve leggere tag o Release |
| Branch chiusi | Tutte le run cancellate | Come per i tag: un branch chiuso non ha più niente da guardare. La pulizia settimanale recupera i branch chiusi prima del workflow |
| Workflow separato | `cleanup-runs.yml`, non un job in `cleanup-build-tags.yml` | Fa una cosa diversa, con permessi diversi (`actions: write` invece di `packages: write`) e una partenza in più (schedule) |
| Nessuna dipendenza funzionale | Cancellare run non rompe nulla | Verificato su `main` (a26e0cb): nessun workflow legge `run_id` o artefatti di altre run; Pipeline e Tag usano solo i tag Git |

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| Solo "ultime 10 per workflow", senza branch (opzione non scelta da Luca il 2026-10-26) | Una settimana di push su un feature fa uscire dalle 10 le run di `main`, compreso l'ultimo rilascio |
| Ultime 10 per workflow e branch, senza regole per rilasci e branch chiusi (opzione non scelta da Luca il 2026-10-26) | Le run dei branch chiusi restano finché non escono dalle 10, cioè per sempre; l'ultimo rilascio di `main` esce dopo 10 push |
| Conservazione per età (es. 30 giorni) | Con pochi push al mese si perde anche l'ultimo rilascio; con molti push resta comunque troppo |
| Affidarsi a "Artifact and log retention" di GitHub | Cancella log e artefatti, non le run |

## Rischi e impatti

- **Cronologia degli Environment**: le deployment di una run cancellata restano
  nell'elenco dell'Environment ma il link alla run non funziona più. Mitigato da
  R3 per i rilasci; per `development` è accettato.
- **Limite dell'API** (1000 richieste l'ora per il `GITHUB_TOKEN`): la prima
  esecuzione ha un arretrato. Mitigato da R8 e dal dry run di default.
- **Cancellazione irreversibile**: una run cancellata non si recupera. Mitigato
  dal dry run di default nella partenza manuale; la prima esecuzione reale va
  lanciata a mano dopo aver letto il dry run.
- **Si prova solo da `main`**: GitHub avvia `schedule` e `delete`, e mostra il
  pulsante della partenza manuale, solo per i workflow presenti nel branch
  predefinito. Il test in `development` sul branch della spec non lo esercita:
  dopo il merge si lancia per prima una run a mano in dry run.

## Test dell'utente

Implementata il 2026-10-26 in `.github/workflows/cleanup-runs.yml`. La logica di selezione è stata
provata nel container con un `gh` finto e run inventate (30 run di `main` con 10 rilasci, un branch
aperto con 15 run, un branch chiuso con 5, un workflow di servizio con 12, una run ferma
all'approvazione): restano le 10 recenti per gruppo, i 10 rilasci, la run in attesa; si cancellano le 5
del branch chiuso; con `MAX_DELETE=3` se ne cancellano 3 e il riepilogo segnala le altre; `keep=0` e
`keep=abc` vengono rifiutati.

Da provare dopo il merge in `main` (prima non parte, vedi Rischi):

1. Lanciare **Cleanup run** a mano con i default (`dry_run=true`) e leggere il riepilogo: le run da
   cancellare devono essere quelle attese, con il motivo giusto.
2. Rilanciare con `dry_run=false`.
3. Cancellare su GitHub un branch feature e controllare che la sua scheda Actions resti vuota.

Esito: da compilare.

## Verifica

Da compilare.

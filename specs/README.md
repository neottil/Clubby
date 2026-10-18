# Indice delle spec

A cosa serve questo file: trovare **se una scelta è già stata discussa**, senza
aprire quattro documenti da centinaia di righe. Ogni riga dice *cosa decide* una
spec, non cosa implementa — per i dettagli si apre la spec.

Il workflow, gli stati e le regole stanno in [AGENTS.md](../AGENTS.md). Le nuove
spec partono da [template.md](template.md).

| # | Spec | Stato | Decide |
|---|---|---|---|
| 001 | [Rendicontazione degli incontri e voci fatturate](001-rendicontazione-e-voci-fatturate.md) | Completata | Che rendicontato e documentato siano **stati persistiti** e non ricostruiti a mano; il riferimento polimorfico `(tipo, riferimento_id)` delle voci; una voce si documenta una volta sola |
| 002 | [Rimozione di promuovi/retrocedi](002-rimozione-promuovi-retrocedi.md) | Completata | Un solo modo di cambiare il privilegio admin: `POST /api/admin/amministratore` |
| 003 | [Ricevute PDF](003-ricevute-pdf.md) | Completata | Che il PDF lo produca l'applicazione, con numerazione per anno e copia conservata; l'isolamento di `service/documenti/`; il logo da `branding/` accanto al processo, scelto da `LOGO_FILE` |
| 004 | [Le ricevute dal lato del socio](004-ricevute-lato-socio.md) | Completata | Che il socio raggiunga le proprie ricevute da **tutte** e tre le voci: movimenti, incontri e tesseramenti; il formato unico del codice `anno_numero` |
| 005 | [Istruzioni d'uso, versione dell'authorizer, vulnerabilità npm](005-istruzioni-versioni-dipendenze.md) | **In test (utente)** | Manuale d'uso nel codice del frontend, una pagina a sezioni filtrate per ruolo, admin e moduli, con le tre modalità di ricarica mostrate all'admin; Info e versioni (`/api/version`, `/version` dell'authorizer) pubbliche, senza accesso; una versione non dichiarata è `null`, mai `"dev"`; la versione del database è il numero dell'ultima migrazione applicata |
| 006 | [Promote con le ultime versioni, Tag senza Environment](006-promote-versioni-automatiche.md) | Confluita nella 009 | Requisiti e decisioni sono passati nella [009](009-pipeline-di-rilascio.md); il file resta come storico |
| 007 | [Numero di tessera, primo tesseramento, risorse dei Deployment](007-numero-tessera-e-risorse.md) | Completata | Il numero di tessera sta su `tesseramento` (uno per rinnovo), testo obbligatorio sui nuovi, un numero per un solo socio; il numero corrente è quello del rinnovo più recente e si corregge solo sul tesseramento in corso; lo stato visto dal socio lo calcola il database come per l'admin; il primo tesseramento resta il flusso del rinnovo con un'altra etichetta; requests e limits su ogni workload |
| 008 | [PATCH per le modifiche parziali](008-patch-per-le-modifiche-parziali.md) | Draft | `POST` crea o esegue un'azione, `PUT` sostituisce l'intera risorsa, `PATCH` ne modifica una parte; i quattro `PUT` parziali (soci, incontri, attività, impostazioni) passano a `PATCH` in due release, con `PUT` deprecato in mezzo; le abilitazioni degli istruttori restano `PUT` |
| 009 | [Pipeline di rilascio: Promote con le ultime versioni, workflow unico, pulizia dei build tag](009-pipeline-di-rilascio.md) | In test (utente) | Riaperta e riapprovata il 2026-10-16 per il workflow unico: a ogni push in `main` la pipeline builda e deploya in `development`, poi si ferma per approvare Tag e per approvare Promote club per club (Environment di approvazione dedicati, elenco dei club nella Variable `CLUBS`); `Rilascio` sparisce. Già implementati: Promote con checkbox e ultima versione taggata, Tag senza Environment e solo da `main`, protezione dell'ultimo tag di `main`, pulizia del branch alla cancellazione, baseline di `main` per il primo push di un branch |

## Dove cercare una decisione che non è in nessuna spec

Non tutto quello che il progetto ha deciso vive in una spec: le prime versioni
sono nate prima di questo workflow. Gli altri posti, in ordine di specificità:

| Tema | Dove |
|---|---|
| Convenzioni di codice, migrazioni, test, workflow | [AGENTS.md](../AGENTS.md) |
| Comportamento del prodotto e modello dei ruoli | [docs/readme/](../docs/readme/) |
| Operazioni su database e cluster | [docs/developer/](../docs/developer/) |
| Perché una riga di codice è scritta così | il commento accanto, che spiega il *perché* |

## Aggiornare questo indice

Fa parte della chiusura di ogni spec, insieme al bump di versione e
all'allineamento dei README: vedi la regola 7 di [AGENTS.md](../AGENTS.md). Una
spec implementata e non indicizzata è una decisione che il prossimo non trova.

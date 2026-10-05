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
| 006 | [Promote con le ultime versioni, Tag senza Environment](006-promote-versioni-automatiche.md) | Draft | Build & Deploy, Tag e Promote restano **separati e manuali**, senza gate di approvazione; in Promote checkbox per scope e versione vuota = ultima taggata in ordine semantico; Tag non si lega a nessun Environment |

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

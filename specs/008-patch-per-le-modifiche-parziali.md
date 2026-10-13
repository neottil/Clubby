# 008 — PATCH per le modifiche parziali

> Nata dalla spec 007: la correzione del numero di tessera è stata fatta con
> `PATCH`, e a quel punto è diventata l'unica modifica parziale del progetto
> con il metodo giusto. Questa spec porta le altre allo stesso modo.

## Stato

- [x] Draft
- [ ] Approvata
- [ ] In test (utente)
- [ ] Completata

**Versioni**: da compilare alla chiusura. Previsti, per fase:

- fase 1: `backend` minor (aggiunge `PATCH`, nessun client si rompe), `frontend` patch;
- fase 2: `backend` **major** (toglie `PUT`: un client che lo usa ancora smette di
  funzionare, regola 5 di AGENTS.md).

`authorizer` non si alza: non ha endpoint `PUT`.

## Problema

Quattro endpoint del backend usano `PUT` per una **modifica parziale**: il
corpo contiene solo i campi da cambiare, e ogni campo omesso resta com'è. Per
HTTP `PUT` vuol dire *sostituire* la risorsa con la rappresentazione inviata: chi
legge l'API si aspetta che un campo omesso venga azzerato, e un client scritto
su quella aspettativa manderebbe la risorsa intera senza bisogno, o eviterebbe
di mandarne una parte per paura di perderla.

| Endpoint | Come si comporta oggi | Metodo corretto |
|---|---|---|
| `PUT /api/soci/:id` | aggiorna solo i campi presenti (`updateSocio`) | `PATCH` |
| `PUT /api/incontri/:id` | aggiorna solo i campi presenti; per l'istruttore toglie anche `istruttore_id` dal corpo | `PATCH` |
| `PUT /api/attivita/:id` | aggiorna solo i campi presenti (es. `{ attiva: false }`) | `PATCH` |
| `PUT /api/impostazioni` | scrive solo le chiavi presenti (`aggiornaImpostazioni`) | `PATCH` |
| `PUT /api/istruttori/:id/attivita` | **sostituisce** l'intero insieme delle abilitazioni | `PUT` — è corretto, resta |

Dal 2026-10 c'è già un `PATCH` (`/api/tesseramenti/rinnovi/:id`, spec 007), e il
CORS del backend lo ammette. Oggi quindi il progetto usa due metodi per la stessa
cosa.

## Obiettivo

Ogni modifica parziale del backend usa `PATCH`; `PUT` resta solo dove il corpo
sostituisce davvero la risorsa. La regola è scritta in AGENTS.md, così il
prossimo endpoint nasce con il metodo giusto.

## Fuori perimetro

- **Gli endpoint "azione" in `POST`** (`/api/admin/ruolo`, `/api/admin/amministratore`,
  `/api/admin/attivo`, `/api/admin/reset-password`, `/api/incontri/rendiconta`,
  `/api/admin/associa-viewer`). Sono comandi, non modifiche di una
  rappresentazione: `POST` è accettabile, e ridisegnarli come `PATCH` sull'account
  è un cambio di modello delle API, non di metodo. Se servirà, spec a sé.
- **`405 Method Not Allowed`.** Oggi un metodo non previsto su una route
  esistente risponde 404, ovunque. Introdurre il 405 (con l'intestazione `Allow`)
  solo per questi quattro endpoint renderebbe il comportamento diverso da tutto il
  resto; farlo per tutto il backend è un'altra modifica.
- **L'authorizer**: non ha endpoint `PUT`.
- **Il comportamento degli endpoint**: validazioni, permessi e risposte restano
  identici. Cambia solo il metodo.

## Requisiti

Due fasi, in due release distinte (vedi [Decisioni](#decisioni)). La fase 2 si fa
solo dopo che la fase 1 è in produzione su tutti gli ambienti.

**Fase 1 — si aggiunge `PATCH`, `PUT` resta come alias deprecato**

| # | Requisito | Test |
|---|---|---|
| R1 | `PATCH /api/soci/:id` si comporta come l'attuale `PUT`: aggiorna solo i campi presenti, stessi permessi (admin) e stesse validazioni | `metodi-http.test.ts` › "PATCH su un socio cambia solo il campo inviato", "PATCH su un socio da non admin → 403" |
| R2 | `PATCH /api/incontri/:id` si comporta come l'attuale `PUT`, compresi i vincoli dell'istruttore (solo i propri incontri, `istruttore_id` ignorato, abilitazione all'attività) e il rifiuto su incontri rendicontati o documentati | `metodi-http.test.ts` › "PATCH su un incontro cambia solo il campo inviato", "PATCH di un istruttore su un incontro non suo → 403"; `incontri-scrittura.test.ts` e `rendicontazione.test.ts` riscritti con `PATCH`, con le stesse attese |
| R3 | `PATCH /api/attivita/:id` si comporta come l'attuale `PUT` (admin) | `metodi-http.test.ts` › "PATCH su un'attività cambia solo il campo inviato"; `dati.ts` disattiva Agility con `PATCH` |
| R4 | `PATCH /api/impostazioni` si comporta come l'attuale `PUT` (admin): scrive solo le chiavi presenti | `metodi-http.test.ts` › "PATCH sulle impostazioni cambia solo la chiave inviata"; `ricariche.test.ts`, `documenti-*.test.ts` e `richieste-non-valide.test.ts` riscritti con `PATCH`, con le stesse attese |
| R5 | In fase 1 `PUT` sulle quattro risorse di R1–R4 funziona ancora come prima, e a ogni chiamata il backend scrive nel log una riga `[deprecato] PUT <percorso>: usare PATCH` | `metodi-http.test.ts` › "PUT su un socio funziona ancora (fase 1)"; manuale: la riga compare nel log del backend |
| R6 | `PUT /api/istruttori/:id/attivita` resta `PUT` e invariato | `metodi-http.test.ts` › "le abilitazioni si sostituiscono ancora con PUT" |
| R7 | Il frontend usa `PATCH` per le quattro modifiche (`updateSocio`, `updateIncontro`, `updateAttivita`, `aggiornaImpostazioni` in `api/client.ts`) | manuale: modifica di un socio, di un incontro, di un'attività e delle impostazioni dall'interfaccia; nella scheda Rete del browser il metodo è `PATCH` e nel log del backend non compare la riga di R5 |
| R8 | Il preflight CORS del backend ammette `PATCH` | `metodi-http.test.ts` › "il preflight CORS ammette PATCH" |
| R9 | `backend/docs/openapi.yaml` descrive le quattro operazioni come `patch`, con `put` marcato `deprecated: true`; in `bruno/` le quattro richieste usano `patch` | revisione del diff |
| R10 | AGENTS.md, fra le Convenzioni del codice, dice quale metodo usare: `POST` crea o esegue un'azione, `PUT` sostituisce l'intera risorsa, `PATCH` ne modifica una parte; la tabella degli endpoint riporta `PATCH` | revisione del diff |

**Fase 2 — si toglie `PUT`**

| # | Requisito | Test |
|---|---|---|
| R11 | `PUT` su `/api/soci/:id`, `/api/incontri/:id`, `/api/attivita/:id` e `/api/impostazioni` risponde **404**, come ogni metodo non previsto | `metodi-http.test.ts` › "PUT su un socio → 404 (fase 2)", "PUT su un incontro → 404 (fase 2)", "PUT su un'attività → 404 (fase 2)", "PUT sulle impostazioni → 404 (fase 2)"; il caso "PUT su un socio funziona ancora (fase 1)" si toglie |
| R12 | In OpenAPI le operazioni `put` deprecate spariscono; il log di R5 non esiste più | revisione del diff |

Ruoli: R1, R3, R4 admin (pagine Soci, Impostazioni, listino); R2 admin e
istruttore (Incontri, Resoconto); il socio non è coinvolto, non modifica niente.

## Modello dati

Nessuna variazione di schema.

## API

| Endpoint | Fase 1 | Fase 2 |
|---|---|---|
| `/api/soci/:id` | `PATCH` nuovo, `PUT` deprecato | solo `PATCH` |
| `/api/incontri/:id` | `PATCH` nuovo, `PUT` deprecato | solo `PATCH` |
| `/api/attivita/:id` | `PATCH` nuovo, `PUT` deprecato | solo `PATCH` |
| `/api/impostazioni` | `PATCH` nuovo, `PUT` deprecato | solo `PATCH` |
| `/api/istruttori/:id/attivita` | `PUT`, invariato | `PUT`, invariato |

Corpo, risposte, permessi e codici d'errore restano quelli di oggi. Nessuno dei
quattro sta dietro un modulo opzionale.

Nel codice l'alias è un solo punto per handler (`method === 'PATCH' || method === 'PUT'`
più la riga di log), in modo che la fase 2 sia la rimozione di quella condizione
e non una riscrittura.

## Interfaccia

Nessuna variazione visibile: cambia il metodo delle chiamate in
`frontend/src/api/client.ts`, non ciò che le pagine mostrano. Il manuale d'uso
non cambia.

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| Quali `PUT` cambiano | I quattro che modificano solo i campi inviati | Sono quelli in cui il metodo dice il contrario di ciò che fa l'endpoint |
| `PUT /api/istruttori/:id/attivita` | Resta | Il corpo è l'insieme completo delle abilitazioni e lo sostituisce: è proprio il significato di `PUT` |
| Due fasi | Prima si aggiunge `PATCH` tenendo `PUT`, poi si toglie `PUT` in una release successiva | Backend e frontend si deployano separatamente (Build & Deploy decide per percorso). Se il backend togliesse `PUT` nella stessa release, un frontend non ancora aggiornato — o una pagina rimasta aperta nel browser con il codice vecchio — fallirebbe ogni salvataggio. È la stessa regola delle migrazioni: prima si aggiunge, la rimozione si fa in due release |
| Log a ogni `PUT` in fase 1 | Una riga `[deprecato]` | È il modo di sapere quando la fase 2 è sicura: niente righe nel log di produzione per qualche giorno vuol dire nessun client rimasto, Bruno e script compresi |
| Fase 2: risposta a `PUT` | 404 | È ciò che il backend risponde oggi a qualunque metodo non previsto (vedi Fuori perimetro per il 405) |
| Versioni | Fase 1 backend minor, fase 2 backend major | La fase 1 aggiunge e non rompe niente; la fase 2 rompe chi usa ancora `PUT` |
| Regola scritta | In AGENTS.md, Convenzioni del codice | Senza, il prossimo endpoint di modifica nasce `PUT` copiando quelli accanto, com'è successo finora |

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| Tenere `PUT` e riportare a `PUT` anche la correzione del numero di tessera (spec 007) | Proposta in implementazione della 007 e scartata dall'utente: `PUT` vuol dire sostituire la risorsa, e qui se ne cambia una parte. La coerenza va ritrovata sul metodo giusto, non su quello più diffuso |
| Cambiare il metodo in una release sola | Rompe il frontend già aperto nei browser e ogni client non aggiornato nello stesso momento (vedi Decisioni, due fasi) |
| Rendere i `PUT` delle vere sostituzioni (campo omesso = azzerato) | Cambierebbe il comportamento di endpoint che il frontend usa con corpi parziali (es. `{ attiva: false }` sull'attività): sarebbe un rischio di perdita di dati per allinearsi al nome del metodo, mentre il comportamento attuale è quello voluto |
| Tenere `PUT` come alias per sempre | Due metodi per la stessa operazione sono esattamente l'ambiguità che questa spec toglie; e un alias senza scadenza non viene mai tolto |
| 405 con intestazione `Allow` in fase 2 | Corretto per HTTP, ma diverso da ogni altro metodo non previsto del backend, che risponde 404. Va fatto per tutto il backend o per niente |

## Gestione delle due fasi

Confermata dall'utente (la spec resta in Draft finché non viene approvata):

1. **Fase 2 dentro questa spec.** La spec resta In test (utente) fra le due fasi
   e si chiude dopo la fase 2.
2. **Quando passare alla fase 2**: con la fase 1 in produzione su tutti gli
   ambienti e nessuna riga `[deprecato]` nel log da almeno una settimana.

> **Promemoria per l'agente — issue GitHub.** Finito il test dell'utente della
> fase 1, e **prima** di marcare la spec Completata, ricordare all'utente di
> aprire una issue che tracci la fase 2, e proporgliene il testo (titolo, cosa
> togliere, la condizione di avvio del punto 2, il riferimento a questa spec e
> ai requisiti R11–R12). Non aprirla da soli: è l'utente a farlo.

## Rischi e impatti

- **Pagine aperte con il frontend vecchio**: coperte dalla fase 1, in cui `PUT`
  funziona ancora.
- **Client esterni** (Bruno, script, chi chiama le API a mano): in fase 1
  funzionano e lasciano una riga nel log; in fase 2 ricevono 404. Il log serve
  proprio a scoprirli prima.
- **Test**: diciotto chiamate `PUT` in `tests/api/` (in `dati.ts`,
  `documenti-emissione`, `documenti-tesseramenti`, `incontri-scrittura`,
  `rendicontazione`, `ricariche`, `richieste-non-valide`); diventano `PATCH`
  tranne le due sulle abilitazioni degli istruttori in `dati.ts`.
- **CORS**: già sistemato dalla spec 007 per il backend; l'authorizer non serve.
- **Documentazione**: OpenAPI, `bruno/`, la tabella degli endpoint e le
  Convenzioni in AGENTS.md. Nessun README di `docs/` nomina il metodo di questi
  endpoint.

## Test dell'utente

Da compilare.

## Verifica

Da compilare dopo il test dell'utente.

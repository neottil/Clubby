# NNN — Titolo della feature

> Copiare questo file in `specs/NNN-titolo-in-kebab-case.md` e compilarlo.
> Il numero è progressivo e non si riusa, nemmeno se una spec viene abbandonata.

## Stato

- [x] Draft
- [ ] Approvata
- [ ] In test (utente)
- [ ] Completata

**Versioni**: da compilare alla chiusura — i soli moduli toccati, con la
versione raggiunta (es. `backend 2.7.0`, `frontend 2.7.0`). Un modulo non
modificato non si alza.

## Problema

Che cosa non funziona o manca **oggi**, e per chi. Non la soluzione: il
problema. Se non si riesce a scriverlo senza nominare la soluzione, la feature
non è ancora chiara.

## Obiettivo

Che cosa sarà vero quando la feature sarà fatta, in una o due frasi.

## Fuori perimetro

Ciò che esplicitamente **non** viene fatto, e perché. È la parte che evita che
l'implementazione cresca per conto suo.

## Requisiti

Numerati, verificabili, uno per riga. Ognuno deve poter diventare un test.

Nella colonna **Test** va scritto per esteso, su ogni riga, il test che copre il
requisito: file e caso (`tesseramenti.test.ts` › "rifiuta un numero vuoto"), o
il controllo manuale da fare. Mai "idem" o "come sopra": ogni riga si legge da
sola.

| # | Requisito | Test |
|---|---|---|
| R1 | | |
| R2 | | |

Chi è coinvolto, per ciascun requisito: quale ruolo (socio, istruttore, admin) e
in quale pagina.

## Modello dati

Tabelle e colonne aggiunte, con la migrazione prevista. Ricordare che sono
ammesse **solo aggiunte**: rinomine e rimozioni si fanno in due release.

Se non serve toccare il database, scriverlo: "nessuna variazione di schema".

## API

Endpoint nuovi o modificati: metodo, percorso, corpo, risposta, permessi, e
comportamento a modulo spento se la feature sta dietro un `ENABLE_MODULE_*`.

## Interfaccia

Pagine e componenti coinvolti. Che cosa vede ciascun ruolo, e che cosa non vede.
Comportamento su schermo stretto, se la feature tocca una tabella.

## Decisioni

Le scelte prese e il perché. È la sezione che fra sei mesi evita di rifare la
stessa discussione.

| Tema | Scelta | Motivo |
|---|---|---|
| | | |

## Alternative scartate

Le strade **valutate e non prese**, con il motivo. Comprese quelle proposte e
rifiutate **durante** l'implementazione: una via scartata a voce vive solo nella
conversazione in cui è stata scartata, e quando quella conversazione finisce
qualcuno la riproporrà — di solito chi l'aveva proposta la prima volta.

Va compilata man mano, non alla fine: è nel momento del rifiuto che si conosce il
motivo.

| Alternativa | Perché no |
|---|---|
| | |

Qui dentro, non altrove, finiscono anche le soluzioni "quasi giuste": quelle che
funzionerebbero ma rompono una coerenza del progetto. Sono le più facili da
riproporre, perché a guardarle isolate non hanno niente che non torni.

## Rischi e impatti

Che cosa questa feature può rompere altrove: altre pagine, altri ruoli, dati
esistenti, pipeline. Come viene mitigato.

## Test dell'utente

Fra l'implementazione e la chiusura. L'implementazione finita porta la spec a
**In test**, non a Completata: da lì è l'utente a provare la feature sui propri
dati e sui propri casi.

In questa fase **la spec può ancora cambiare**: se la prova fa emergere un
requisito sbagliato, mancante o scomodo, si aggiorna la spec e si rimette mano
al codice, senza aprirne una nuova.

Esito da annotare qui: cosa è stato provato, cosa è stato corretto, cosa è stato
accettato così com'è.

## Verifica

Come si è controllato che i requisiti siano soddisfatti: test automatici,
controlli manuali, query sul database. Da compilare **dopo** il test
dell'utente, prima di marcare la spec come Completata.

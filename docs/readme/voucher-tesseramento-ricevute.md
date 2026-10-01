# Voucher, tesseramento e ricevute


Un socio paga l'associazione in tre modi, tenuti distinti:

- **Voucher prepagato**: il socio acquista credito (movimento di tipo `ricarica`, positivo) e lo
  consuma (movimenti di tipo `addebito`, negativi). Gli addebiti nascono solo dagli incontri: vengono
  generati insieme all'incontro, ne conservano il riferimento e non si inseriscono a mano. Un admin
  registra a mano solo le ricariche, dal bottone "Ricarica" della pagina Voucher. Un voucher nuovo
  nasce senza credito: dopo averlo associato al socio si apre subito la ricarica, con cui si registra
  l'importo acquistato. Un voucher può anche nascere con un **saldo importato**, per portare in
  Clubby credito venduto prima di usarlo: non è un acquisto, sta dietro una spunta nel form.

  Nella pagina Voucher chi ha una scheda socio collegata, admin compresi, vede il proprio voucher in una
  card in cima, con i suoi movimenti. Sotto, in tabella, i voucher degli altri soci: l'admin li gestisce
  tutti, un istruttore ne vede i saldi ma non i movimenti, un socio non ha la tabella.
- **Tesseramento**: ogni rinnovo registra una scadenza e la quota pagata, proposta dal valore
  configurato nella pagina Impostazioni. La quota non passa dal voucher, si paga a parte. La nuova scadenza
  deve seguire sia la data del rinnovo sia la scadenza precedente, e i rinnovi restano nello storico.
  Il socio vede la propria scadenza e i propri rinnovi nella pagina Tesseramenti; l'admin li vede
  per tutti, e solo lui rinnova.
- **Incontri non coperti da voucher**: chi non ha un voucher paga l'incontro a parte.

La pagina **Ricevute** (solo admin) somma esattamente queste tre cose: ricariche, quote e incontri
senza voucher, filtrabili per socio e per periodo. Restano fuori gli addebiti sul voucher — già
coperti dalla ricarica che li paga, contarli di nuovo raddoppierebbe l'importo — e il saldo
importato, che non è un incasso.

La pagina ha due schede, sugli stessi filtri: **Crea ricevuta**, con le voci ancora da documentare, e
**Ricevute emesse**, con lo storico dei PDF prodotti.

## Ricevute in PDF

Selezionate le voci di **un socio** — una ricevuta è intestata a una persona sola, quindi il pulsante
resta spento finché non se ne sceglie uno — si indica una causale e si ottiene un'**anteprima**. Solo
la conferma emette davvero: assegna il numero, genera il PDF definitivo e lo conserva.

Il numero **riparte da 1 a ogni anno** e non ha buchi: lo assegna un contatore per anno, dentro la
stessa transazione che scrive il documento. Due amministratori che confermano nello stesso istante
ricevono numeri consecutivi, e nessuna delle due emissioni fallisce.

Una ricevuta emessa **non si annulla e non si elimina**, ed è il motivo per cui esiste l'anteprima:
l'errore si vede prima di commetterlo. Da quel momento la voce d'origine non si può più cancellare né
modificare.

I byte del PDF restano nel database, quindi finiscono nei backup e si ripristinano insieme alla riga
che li referenzia. Chi può riaprirli: l'amministratore, e il **socio intestatario** dalla colonna
comparsa nei propri movimenti.

Il file scaricato si chiama `ricevuta_<anno>_<numero>.pdf`: l'anno prima del numero, così una cartella
ordinata per nome segue l'ordine di emissione, e nessun dato della persona nel nome del file. Lo stesso
nome vale da qualunque tabella lo si scarichi.

Le righe comprese in una ricevuta ne mostrano il **codice** `<anno>_<numero>`, cliccabile per scaricare
il PDF. Compare ovunque nasca un incasso, così il socio arriva alla ricevuta dalla riga che la ha
generata: voci e ricevute emesse in Ricevute, movimenti del voucher, incontri, rinnovi del
tesseramento. Il codice e non un'icona perché dice *quale* ricevuta, senza doverla aprire.

Un istruttore **non** vede la ricevuta degli incontri che ha soltanto tenuto: quelli sono di altri
soci, e il documento non è suo. Li vede solo dove compare come socio.

Intestazione e piè di pagina si scrivono nella pagina **Impostazioni**, card *Ricevute*, e valgono
dalla ricevuta successiva: quelle già emesse conservano il testo che avevano — il PDF è congelato
all'emissione, quindi una ricevuta prodotta prima di configurarli resta senza. Proprio per questo,
**finché l'intestazione non è configurata la voce di menù Ricevute resta spenta**, con un `?` accanto
che dice dove configurarla: una ricevuta emessa non si annulla, e una senza intestazione resterebbe
tale per sempre.

Nel PDF l'intestazione è allineata a **sinistra** e il logo sta a **destra sulla stessa riga**, come
la carta intestata di un'associazione. Il **logo** invece è
quello del club, lo stesso mostrato in testa a ogni pagina (vedi [`branding/`](../../branding/README.md)).

## Voci già registrate

La pagina serve a sapere **che cosa resta da registrare**, quindi le voci per cui una ricevuta è già
stata emessa non compaiono — indipendentemente dai filtri per socio e per periodo. Uno switch sopra la
tabella le fa tornare, con la casella spuntata e bloccata.

Si scelgono le voci con le caselle della prima colonna, o tutte quelle a video con quella in testata. Le
scelte restano valide anche caricando altri blocchi: si possono spuntare le prime venticinque, premere
"Carica altri" e aggiungere le successive prima di emettere; cambiando un filtro, invece, la selezione si
azzera, perché resterebbe viva su righe non più a video.

L'emissione **non si annulla**, e per lo stesso motivo una voce già documentata **non si può né modificare
né eliminare**: né direttamente (un incontro registrato non si cancella e non cambia di costo) né per via
traversa (un socio con voci registrate o incontri rendicontati non si elimina, perché cancellarlo se li
porterebbe dietro in cascata). Una ricevuta emessa deve continuare a riferire qualcosa che esiste, e che
non è cambiato sotto.

Sotto, la relazione è registrata in `documento_emesso_voce`, che lega una voce al documento che la
comprende. Le voci marcate come emesse prima che l'applicazione producesse ricevute restano senza
documento: dicono "già emessa" e nient'altro, ed è il motivo per cui nelle tabelle la colonna del PDF
può risultare vuota. La relazione è polimorfica, perché le voci vengono da tre tabelle diverse: è il
motivo per cui non può esserci un vincolo di integrità verso l'origine, e quindi il motivo per cui
l'eliminazione va impedita a monte.

## Ricariche con valore extra

Di norma una ricarica accredita sul voucher esattamente l'importo pagato. La variabile
`RECHARGE_MODE` dell'ambiente permette di riconoscere al socio un valore maggiore:

| `RECHARGE_MODE` | Come si registra una ricarica | Configurazione |
|---|---|---|
| `free` (predefinita) | Importo libero, accreditato tale e quale | nessuna |
| `percentage` | Importo libero, accreditato con una percentuale in più | percentuale nella card **Ricariche** delle Impostazioni |
| `map` | Importo scelto fra tagli preconfigurati (es. 50 → 55, 100 → 110) | elenco dei tagli nella card **Ricariche** |

**In Ricevute compare sempre l'importo pagato**, mai il valore accreditato: il credito in più
è uno sconto concesso al socio, non denaro incassato, e contarlo dichiarerebbe un ricavo che non
c'è stato. Il voucher invece si muove per il valore accreditato, che è quello che il socio può
spendere. Il movimento conserva entrambi, e la pagina Voucher mostra il credito ricevuto con sotto
l'importo pagato quando differiscono.

Quanto accreditare **lo calcola sempre il backend** a partire dalla modalità e dalla
configurazione salvata: il browser invia solo quanto il socio paga. In modalità `map` un importo
che non corrisponde a nessun taglio viene rifiutato.

La card **Ricariche** delle Impostazioni è sempre visibile: in modalità `free` spiega come attivare
la funzionalità, così i tagli o la percentuale si possono preparare prima di accenderla. Il
database ha comunque la tabella dei tagli e la colonna dell'importo pagato, in ogni modalità: sono
gli stessi per tutti gli ambienti.

## Moduli opzionali

Tesseramento e Ricevute sono **moduli opzionali**, attivati per singolo ambiente dalle Variables
`ENABLE_MODULE_TESSERAMENTO` e `ENABLE_MODULE_RICEVUTE` (vedi
[Variables](variabili-e-secret.md#variables)). Valgono solo con il valore esatto `true`: una variabile mancante o scritta
diversamente lascia il modulo spento.

Con un modulo spento spariscono la voce di menu e la pagina, e le relative API rispondono `404` come
qualunque percorso inesistente — il controllo sta nel backend, il frontend evita soltanto di mostrare
sezioni che non funzionerebbero. Senza Tesseramento sparisce anche la configurazione della quota dalla
pagina Impostazioni.

I due moduli sono indipendenti: Ricevute senza Tesseramento funziona (mancheranno le voci di quel
tipo), e Tesseramento senza Ricevute registra rinnovi e quote che però nessuna pagina riepiloga.
Il database è sempre completo — niente migrazioni per accendere o spegnere un modulo, e lo storico si
ritrova intatto alla riaccensione.


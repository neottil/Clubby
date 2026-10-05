# Modello utenti e ruoli


## Ruoli

Ogni account ha un **ruolo nel club** e, a parte, può avere il **privilegio di amministratore**.

Ruoli:

- **socio**: partecipa agli incontri e vede i propri dati (scheda, incontri, voucher, movimenti). È il
  ruolo di ogni nuovo account.
- **istruttore**: tiene incontri, che registra, modifica ed elimina dalla pagina Resoconto nelle sole
  attività a cui è abilitato. Può a sua volta partecipare come socio agli incontri di un altro
  istruttore: quelli restano nella pagina Incontri, in sola lettura. Vede inoltre l'elenco dei soci
  ridotto al nominativo e i saldi dei voucher.

Privilegio **admin**: amministra l'applicazione — account, ruoli, listino delle attività, abilitazioni,
soci e voucher — ed è indipendente dal ruolo, quindi un istruttore può essere admin. Si concede e si
toglie con la casella "Admin" nella card Utenti - Soci della pagina Impostazioni; un admin non può toglierlo a sé
stesso.

Il ruolo sta dentro il token. Cambiarlo chiude tutte le sessioni aperte
dell'interessato: finché il token vecchio non scade porterebbe ancora i permessi
precedenti.

## Attività e abilitazioni

Le attività sono un listino a database (nome e costo proposto), gestito dalla pagina Impostazioni. Il costo è
unico per attività, e viene proposto quando la si sceglie in un incontro: il costo effettivo resta
sull'incontro, così un ritocco al listino non riscrive lo storico.

A ogni istruttore si assegnano le attività che può svolgere. È un vincolo, non un aiuto
all'inserimento: un istruttore che prova a registrare un incontro di un'attività non sua viene
rifiutato dal backend, anche chiamando l'API direttamente.

Un'attività con incontri collegati non è eliminabile — si disattiva: sparisce dalle scelte e resta
leggibile sullo storico.

## Incontri e resoconti

Un account può comparire in un incontro in due vesti, che l'interfaccia tiene separate: la pagina **Incontri**
mostra quelli a cui ha partecipato come socio, in sola lettura; la pagina **Resoconto** mostra a un istruttore
quelli che ha tenuto, con la stessa tabella, i totali del periodo nella riga dei filtri, e la possibilità di
registrarli e correggerli. L'admin, in Incontri, vede e gestisce tutti gli incontri, con i totali del periodo
filtrato; nella pagina **Resoconti** consulta quelli tenuti da un istruttore, con gli stessi filtri.

## Rendicontazione degli incontri

Il club riconosce all'istruttore una percentuale sugli incontri che ha tenuto, e ha bisogno di sapere dove si
era fermato il conteggio precedente. In **Resoconti** l'admin sceglie gli incontri con le caselle della prima
colonna — o tutti quelli a video con quella in testata — e li marca come rendicontati. Gli identificativi
scelti restano validi anche caricando altri blocchi: si possono spuntare i primi venticinque, premere "Carica
altri" e aggiungere anche i successivi prima di salvare. Cambiando un filtro la selezione si azzera, perché
resterebbe viva su righe non più a video.

Uno switch sopra la tabella fa comparire anche gli incontri già rendicontati, con la casella spuntata e
bloccata: la rendicontazione **non si annulla**, e per lo stesso motivo un incontro rendicontato **non si può
più né modificare né eliminare** — il conteggio su cui l'istruttore è stato pagato deve restare
ricostruibile. Il blocco vale per l'intera riga e non per il solo costo: spostare la data farebbe uscire
l'incontro dal periodo in cui è stato conteggiato, che è lo stesso danno per un'altra via. Per correggere un
errore contattare l'amministratore. Lo switch parte
spento per l'admin, che apre la pagina per sapere che cosa resta da fare, e acceso nella pagina Resoconto
dell'istruttore, che la apre per consultare il proprio lavoro.

Solo l'admin rendiconta: un istruttore vede lo stato dei propri incontri ma non lo decide. Altrove — nella
pagina Incontri, e per il socio — la rendicontazione non compare e non nasconde nulla: riguarda il compenso
dell'istruttore, non lo storico di chi ha partecipato.

Filtri, ordinamento e totali sono calcolati dal database sull'intero risultato filtrato: gli elenchi arrivano a
blocchi, e un calcolo nel browser sulle sole righe caricate darebbe numeri falsi.


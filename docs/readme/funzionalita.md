# Funzionalità


- Gestione soci
- Gestione incontri, con note in testo semplice o in Markdown, filtrabili per attività e per periodo
- Listino delle attività con il relativo costo, gestito dalla pagina Impostazioni
- Attribuzione degli incontri a un istruttore, abilitato per singola attività
- Voucher prepagati, con il credito acquistato registrato come ricarica; a scelta del club, la
  ricarica può accreditare più di quanto pagato (percentuale fissa o tagli preconfigurati)
- Tesseramento al club: scadenza per socio, rinnovi con storico e quota configurabile *(modulo opzionale)*
- Ricevute: ricariche, quote di tesseramento e incontri non coperti da voucher, con i totali del
  periodo e il segno di quelli già documentati *(modulo opzionale)*
- Ricevute in PDF: numerate per anno, viste in anteprima prima di confermarle, conservate
  nell'applicazione e riapribili anche dal socio intestatario *(modulo opzionale)*
- Resoconto: un istruttore vede gli incontri che ha tenuto, con numero e costo complessivo del periodo filtrato
- Resoconti per l'admin: gli incontri tenuti da un istruttore, filtrabili per periodo e attività, con la
  rendicontazione di quelli già riconosciuti
- Manuale d'uso nella pagina Manuale, con le sole sezioni che riguardano chi la apre: i propri dati
  per il socio, Resoconto e saldi dei voucher per l'istruttore, tutte le pagine e le configurazioni per
  l'admin. Ruolo e privilegio admin si sommano; le pagine dei moduli spenti non vengono descritte, e
  all'admin sono mostrate tutte e tre le modalità di ricarica con quella del club evidenziata
- Pagina Info con le versioni in esecuzione di frontend, backend e authorizer, e la versione del database
  (il numero dell'ultima migrazione applicata), raggiungibile **anche senza
  accesso** (il menu si riduce a Info e Accedi): serve soprattutto quando l'accesso non funziona. Una
  versione che l'ambiente non dichiara compare come "non disponibile"
- Elenchi caricati a blocchi (incontri, movimenti, ricevute, soci, voucher, tesseramenti, account),
  con ricerca e ordinamento applicati dal server, per non scaricare tutto a ogni apertura


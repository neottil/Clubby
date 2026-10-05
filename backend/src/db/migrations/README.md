# Migrazioni — database dell'applicazione

Modifiche allo schema successive a `../schema.sql`, che resta la **baseline**
con cui Infra crea un database nuovo e non va più modificata.

Questi file **finiscono dentro l'immagine del backend** (vedi `backend/Dockerfile`)
e li applica [`scripts/migra.sh`](../../../../scripts/migra.sh), eseguito da un
Job Kubernetes che il workflow
[`migrate-db.yml`](../../../../.github/workflows/migrate-db.yml) crea **prima**
del rollout, sulla stessa immagine che sta per essere deployata. Un file già
applicato viene saltato (tabella `migrazione`), quindi rilanciare è sicuro.

## Il numero è la versione del database

Il prefisso numerico dell'ultima migrazione applicata è la **versione dello
schema**: `GET /api/version` la restituisce nel campo `db`, e la pagina Info la
mostra alla riga Database. Non c'è un altro numero da tenere allineato: per
sapere se il database di un club è indietro rispetto al codice basta
confrontarlo con l'ultimo file di questa cartella. Per questo i numeri non si
riusano e non si riordinano.

## Regole

- **Un file per migrazione**, con nome ordinabile: `001_descrizione.sql`,
  `002_...`. Vengono applicati in ordine alfabetico.
- **Niente transazioni dentro al file**: ci pensa il workflow, che avvolge il
  file e la propria riga di registro in un unico `BEGIN`/`COMMIT`. O passa
  tutto, o non passa niente.
- **Solo aggiunte.** Tabelle, colonne nullable (o con default), indici. Mai
  rinomine, `DROP` o cambi di tipo nella stessa release che introduce il codice
  che li usa.

La terza regola è quella che conta, e il motivo è l'ordine degli eventi:
migrazione prima, deploy dopo. Se il deploy fallisce resta un database più
avanti dell'applicazione, e il codice vecchio semplicemente ignora ciò che non
conosce. Al contrario, un'applicazione più avanti del proprio schema è rotta
subito.

Rimuovere qualcosa si fa quindi in **due release**: nella prima il codice
smette di usare la colonna, in una successiva una migrazione la elimina.

## Locale

Si applicano da sé: `docker compose up -d` avvia anche il servizio
`migrazioni`, che aspetta che Postgres sia pronto, esegue le migrazioni
pendenti su entrambi i database e termina. Non serve un client Postgres
sull'host, e funziona identico da Windows o da WSL.

Dopo aver aggiunto un file, per applicarlo senza riavviare il compose:

```bash
npm run db:migra
```

È lo stesso servizio, rilanciato a mano. In entrambi i casi è idempotente:
senza migrazioni pendenti stampa una riga e chiude.

Nota: gli script in `/docker-entrypoint-initdb.d` **non** servono allo scopo —
Postgres li esegue solo al primo avvio su un volume vuoto, cioè quando il
database nasce già dalla baseline aggiornata e non c'è niente da migrare.

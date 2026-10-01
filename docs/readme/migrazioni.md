# Migrazioni dello schema


In produzione i dati non si buttano: le modifiche allo schema si applicano come **migrazioni**, file SQL
numerati che vengono eseguiti una volta sola e registrati nella tabella `migrazione` del database su cui
girano.

- `backend/src/db/schema.sql` e `authorizer/src/db/schema.sql` restano la **baseline**: creano un database
  nuovo da zero (lo applica [Infra](pipeline-ci-cd.md#infra)) e **non vanno più modificati**.
- Ogni modifica successiva è un file in `backend/src/db/migrations/` o
  `authorizer/src/db/migrations/`, con nome ordinabile (`001_descrizione.sql`).
- Le applica il workflow riutilizzabile
  [`migrate-db.yml`](../../.github/workflows/migrate-db.yml), chiamato da `Build & Deploy` e da `Promote`
  **prima** dei deploy di backend e authorizer, che non partono se una migrazione fallisce.
- Il meccanismo è un **Job Kubernetes che gira sull'immagine che sta per essere deployata**: quell'immagine
  contiene sia lo script ([scripts/migra.sh](../../scripts/migra.sh)) sia i file `.sql`, quindi le migrazioni
  applicate sono esattamente quelle che accompagnano quel codice. L'immagine esiste su `ghcr.io` da quando
  è stata buildata, molto prima del rollout: eseguirci un comando non mette in servizio l'applicazione, e i
  pod continuano a girare con la versione precedente. Il Job si collega al database via rete con le
  credenziali del club — non entra nel pod di Postgres, che sta nel namespace dell'istanza **condivisa fra
  più club** e il cui socket locale autentica in `trust`: entrarci darebbe privilegi da superutente su
  tutti i loro database per migrarne uno solo.
- Se il Job fallisce o non termina entro cinque minuti, il workflow ne stampa i log nella pipeline e si
  ferma.
- Ogni file è applicato in una transazione **insieme alla riga che lo registra**: o passa tutto, o non passa
  niente, e non resta una migrazione segnata come fatta a metà. Per questo un file non deve contenere
  `BEGIN`/`COMMIT` propri.

## Le migrazioni devono essere retrocompatibili

**Solo aggiunte** — tabelle, colonne nullable o con default, indici. Mai rinomine, `DROP` o cambi di tipo
nella stessa release che introduce il codice che li usa.

Il motivo sta nell'ordine: la migrazione gira prima del deploy, e i due disallineamenti possibili non si
equivalgono.

| Situazione | Conseguenza |
|---|---|
| Database avanti, applicazione indietro (migrazione fatta, deploy fallito o non ancora eseguito) | Innocuo: il codice in esecuzione ignora ciò che non conosce |
| Applicazione avanti, database indietro | Rotto subito: il codice nuovo interroga colonne che non esistono |

Da qui la regola pratica: **un cambiamento distruttivo si fa in due release**. Nella prima il codice smette
di usare la colonna (o la tabella), e va in produzione; in una release successiva una migrazione la
elimina. Saltare il passaggio significa avere, per tutta la finestra fra migrazione e rollout — e per
sempre, se il rollout fallisce — un'applicazione che interroga qualcosa che non c'è più.


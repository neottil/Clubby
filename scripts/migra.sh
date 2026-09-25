#!/bin/sh
# Applica le migrazioni di schema presenti nell'immagine al database indicato
# dalle variabili d'ambiente.
#
# POSIX sh e non bash: oltre che dall'immagine del backend (che ha bash) questo
# script viene eseguito anche dentro l'immagine ufficiale di Postgres, per
# l'ambiente locale, dove non voglio dare per scontato quale shell ci sia.
#
# Eseguito da un Job Kubernetes creato dal workflow migrate-db.yml, sulla
# STESSA immagine che sta per essere deployata: le migrazioni applicate sono
# così esattamente quelle che accompagnano quel codice, non quelle presenti nel
# repository al momento della run.
#
# Gira dentro il cluster e si collega al database via rete con le credenziali
# del club (le stesse dell'applicazione), non entrando nel pod di Postgres: su
# un'istanza condivisa fra più club, entrare in quel pod significherebbe avere
# privilegi da superutente su tutti i loro database per migrarne uno solo.
#
# Variabili richieste: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD.
# Cartella delle migrazioni: MIGRATIONS_DIR (default /app/migrations).
#
# Idempotente: ogni file applicato viene registrato nella tabella "migrazione"
# e non viene più riapplicato. Rieseguire il Job senza migrazioni pendenti
# stampa una riga e termina con successo.
# Niente "pipefail" (non è POSIX): in ogni pipeline qui sotto psql è l'ultimo
# comando, quindi è il suo esito a determinare quello della pipeline, ed "-e"
# basta a fermare lo script.
set -eu

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/migrations}"
DB_PORT="${DB_PORT:-5432}"

# Controlli espliciti invece di un ciclo con espansione indiretta (${!nome}),
# che è una sintassi bash.
manca() {
  echo "ERRORE: la variabile $1 non è impostata." >&2
  exit 1
}
[ -n "${DB_HOST:-}" ]     || manca DB_HOST
[ -n "${DB_NAME:-}" ]     || manca DB_NAME
[ -n "${DB_USER:-}" ]     || manca DB_USER
[ -n "${DB_PASSWORD:-}" ] || manca DB_PASSWORD

export PGPASSWORD="$DB_PASSWORD"
# client_min_messages=warning: gli "already exists, skipping" di un file
# scritto in modo difensivo coprirebbero ciò che conta.
export PGOPTIONS='-c client_min_messages=warning'

psql_db() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
       -v ON_ERROR_STOP=1 -q -t -A "$@"
}

echo "[migra] database $DB_NAME su $DB_HOST:$DB_PORT come $DB_USER"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "[migra] nessuna cartella $MIGRATIONS_DIR: niente da applicare."
  exit 0
fi

FILE_SQL=$(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort || true)
if [ -z "$FILE_SQL" ]; then
  echo "[migra] nessun file di migrazione: niente da applicare."
  exit 0
fi

# Il registro si crea da sé la prima volta. È nello stesso database che
# descrive: un club non deve poter leggere lo stato di un altro.
echo "CREATE TABLE IF NOT EXISTS migrazione (
        nome TEXT PRIMARY KEY,
        applicata_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );" | psql_db > /dev/null

APPLICATE=$(echo "SELECT nome FROM migrazione;" | psql_db)

PENDENTI=0
for f in $FILE_SQL; do
  base=$(basename "$f")
  if echo "$APPLICATE" | grep -qxF "$base"; then
    echo "[migra]   = $base (già applicata)"
    continue
  fi

  echo "[migra]   + $base"
  # BEGIN/COMMIT attorno al file E alla riga di registro: se il file fallisce a
  # metà non resta né lo schema a metà né la migrazione segnata come fatta.
  # Per questo un file non deve contenere transazioni proprie.
  {
    echo "BEGIN;"
    cat "$f"
    echo ""
    echo "INSERT INTO migrazione (nome) VALUES ('$base');"
    echo "COMMIT;"
  } | psql_db
  PENDENTI=$((PENDENTI + 1))
done

if [ "$PENDENTI" -eq 0 ]; then
  echo "[migra] nessuna migrazione pendente: il database era già aggiornato."
else
  echo "[migra] $PENDENTI migrazioni applicate."
fi

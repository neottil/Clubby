# Esecuzione delle query sui due database
#
# Parte di scripts/seed-demo-data.sh, che lo carica con "source": non si
# esegue da solo e non ha shebang di proposito.

# ------------------------------------------------------------
# Helper
# ------------------------------------------------------------
# Il primo valore di una query, senza pipe verso head (vedi sopra).
# ON_ERROR_STOP=1: un errore SQL interrompe invece di restituire un valore
# vuoto che si propagherebbe nelle query successive come UUID non valido.
psql_scalar() {
  local out
  out=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -tAc "$1")
  printf '%s\n' "${out%%$'\n'*}"
}

psql_exec() {
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -q -c "$1" > /dev/null
}

psql_righe() {
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -tA -F ' | ' -c "$1"
}

# Sul database degli account: l'authorizer non espone né eliminazione né
# assegnazione diretta di ruolo e privilegio senza un token admin, e il seed
# deve poter girare su un'istanza appena creata.
psql_auth_scalar() {
  local out
  out=$(PGPASSWORD="$AUTH_DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$AUTH_DB_USER" -d "$AUTH_DB_NAME" \
    -v ON_ERROR_STOP=1 -tAc "$1")
  printf '%s\n' "${out%%$'\n'*}"
}

psql_auth_exec() {
  PGPASSWORD="$AUTH_DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$AUTH_DB_USER" -d "$AUTH_DB_NAME" \
    -v ON_ERROR_STOP=1 -q -c "$1" > /dev/null
}

# Data di N giorni fa (YYYY-MM-DD), portabile fra GNU date e BusyBox.
days_ago() {
  local now
  now=$(date -u +%s)
  date -u -d "@$((now - $1 * 86400))" +%F 2>/dev/null || date -u -v-"$1"d +%F
}

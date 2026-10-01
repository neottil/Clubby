# Verifiche preliminari: i due database sono quelli attesi, l'authorizer risponde
#
# Parte di scripts/seed-demo-data.sh, che lo carica con "source": non si
# esegue da solo e non ha shebang di proposito.

# ------------------------------------------------------------
# 0. Verifiche preliminari
# ------------------------------------------------------------
# Di entrambi i database non si verifica solo la raggiungibilità, ma che
# contengano le tabelle che dovrebbero avere — e PRIMA di distruggere
# qualcosa. Puntare al database sbagliato non dava errore: l'azzeramento non
# trovava tabelle da svuotare e veniva saltato in silenzio (il passo tratta
# "nessuna tabella" come "database già vuoto"), il seed proseguiva a registrare
# gli account su un'installazione mai azzerata, e la cosa emergeva molto più
# avanti come un 409 sulla prima registrazione.
#
# Collegamento e contenuto sono due controlli distinti, con due messaggi
# distinti. Dentro una condizione `if` set -e non interviene, quindi un psql che
# non si collega restituisce una stringa vuota e proseguirebbe: unendo i due
# controlli, un database spento veniva annunciato come "manca la tabella
# socio" — vero in senso stretto, e fuorviante.
echo "▶ Verifico il database dei dati ($DB_USER@$DB_HOST:$DB_PORT/$DB_NAME)..."
if ! psql_exec "SELECT 1;" 2>/dev/null; then
  echo "ERRORE: non riesco a collegarmi a $DB_NAME su $DB_HOST:$DB_PORT come $DB_USER." >&2
  echo "  Il database è avviato? In locale: docker compose up -d" >&2
  exit 1
fi
if [ "$(psql_scalar "SELECT to_regclass('public.socio') IS NOT NULL;")" != "t" ]; then
  echo "ERRORE: nel database $DB_NAME non esiste la tabella 'socio'." >&2
  echo "  Non è il database applicativo di Clubby, oppure lo schema non è stato applicato." >&2
  echo "  Controlla DB_NAME, DB_USER e DB_HOST." >&2
  exit 1
fi
echo "  OK."

echo "▶ Verifico il database degli account ($AUTH_DB_USER@$DB_HOST:$DB_PORT/$AUTH_DB_NAME)..."
if ! psql_auth_exec "SELECT 1;" 2>/dev/null; then
  echo "ERRORE: non riesco a collegarmi a $AUTH_DB_NAME su $DB_HOST:$DB_PORT come $AUTH_DB_USER." >&2
  echo "  Controlla AUTH_DB_NAME, AUTH_DB_USER e AUTH_DB_PASSWORD." >&2
  exit 1
fi
if [ "$(psql_auth_scalar "SELECT to_regclass('public.utente') IS NOT NULL;")" != "t" ]; then
  echo "ERRORE: nel database $AUTH_DB_NAME non esiste la tabella 'utente'." >&2
  echo "  Non è il database dell'authorizer. Controlla AUTH_DB_NAME, AUTH_DB_USER e" >&2
  echo "  AUTH_DB_PASSWORD: in cluster i due database si chiamano <ambiente>-clubby e" >&2
  echo "  <ambiente>-auth, non clubby e clubby_auth." >&2
  exit 1
fi
echo "  OK."

echo "▶ Verifico l'authorizer ($AUTH_INTERNAL_URL)..."
if ! curl -sf "$AUTH_INTERNAL_URL/health" > /dev/null; then
  echo "ERRORE: l'authorizer non risponde su $AUTH_INTERNAL_URL. Avvialo prima di eseguire il seed." >&2
  exit 1
fi
echo "  OK."


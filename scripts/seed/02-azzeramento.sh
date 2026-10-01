# Azzeramento dei due database, con conferma
#
# Parte di scripts/seed-demo-data.sh, che lo carica con "source": non si
# esegue da solo e non ha shebang di proposito.

# ------------------------------------------------------------
# 1. Azzeramento dei due database
# ------------------------------------------------------------
# Reset completo, non "rimuovo i miei dati". Una pulizia parziale lascia in
# giro proprio le righe che poi confondono: ricevute di prove precedenti,
# impostazioni di un altro club, account registrati a mano. E lascia un vincolo
# sgradevole — `documento.socio_id` non ha cascata, quindi una sola ricevuta
# emessa dall'interfaccia bloccava la cancellazione del socio e con essa
# l'intero seed.
#
# Si svuota OGNI tabella dello schema public tranne il registro delle
# migrazioni: elencarle a mano avrebbe significato dimenticarne una alla
# prossima aggiunta, con un difetto silenzioso. TRUNCATE ... CASCADE ignora
# l'ordine delle foreign key, che è l'altra metà del problema, e RESTART
# IDENTITY riporta a zero anche i contatori — compreso quello della
# numerazione delle ricevute, che riparte davvero da 1.
if [ "${SEED_FORZA:-}" != "1" ]; then
  echo ""
  echo "  ATTENZIONE: sto per SVUOTARE COMPLETAMENTE due database."
  echo "    dati      $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
  echo "    account   $AUTH_DB_USER@$DB_HOST:$DB_PORT/$AUTH_DB_NAME"
  echo "  Spariscono soci, incontri, voucher, ricevute, impostazioni e account."
  echo "  L'operazione non è reversibile."
  echo ""
  # Si legge dallo standard input e NON da /dev/tty: con /dev/tty lo script
  # lanciato da uno script, da una pipe o da un job resterebbe appeso per
  # sempre ad aspettare una risposta che nessuno digiterà. Meglio fallire
  # subito dicendo come procedere.
  if [ ! -t 0 ]; then
    echo "  ERRORE: serve una conferma, ma lo standard input non è un terminale." >&2
    echo "  Esegui lo script da un terminale, oppure imposta SEED_FORZA=1." >&2
    exit 1
  fi
  printf "  Scrivi 'azzera' per procedere: "
  CONFERMA=""
  read -r CONFERMA || CONFERMA=""
  if [ "$CONFERMA" != "azzera" ]; then
    echo "  Annullato: niente è stato modificato." >&2
    exit 1
  fi
  echo ""
fi

echo "▶ Azzero i database..."
# if e non "[ ... ] && ...": con set -e una condizione falsa in coda a una riga
# farebbe uscire lo script, e un database senza tabelle non è un errore.
TABELLE=$(psql_scalar "
  SELECT string_agg(quote_ident(tablename), ', ')
    FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrazione';")
if [ -n "$TABELLE" ]; then
  psql_exec "TRUNCATE TABLE $TABELLE RESTART IDENTITY CASCADE;"
fi

TABELLE_AUTH=$(psql_auth_scalar "
  SELECT string_agg(quote_ident(tablename), ', ')
    FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrazione';")
if [ -n "$TABELLE_AUTH" ]; then
  psql_auth_exec "TRUNCATE TABLE $TABELLE_AUTH RESTART IDENTITY CASCADE;"
fi

# Si controlla il risultato, non l'assenza di errori: è l'unico modo di
# accorgersi che lo svuotamento ha agito su un database diverso da quello che
# usa l'authorizer con cui parleremo fra due righe.
RESIDUI=$(psql_auth_scalar "SELECT COUNT(*) FROM utente;")
if [ "$RESIDUI" != "0" ]; then
  echo "ERRORE: dopo l'azzeramento in $AUTH_DB_NAME restano $RESIDUI account." >&2
  exit 1
fi
echo "  Fatto."

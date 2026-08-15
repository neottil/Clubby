#!/bin/bash
# Crea database e utente dell'authorizer, poi vi applica il suo schema.
#
# Eseguito da Postgres al primo avvio (/docker-entrypoint-initdb.d), dopo lo
# schema applicativo. Serve uno script e non un semplice .sql perché i file
# della cartella di init vengono eseguiti tutti sul database predefinito
# (POSTGRES_DB, cioè quello dell'app): lo schema dell'authorizer va invece
# applicato al SUO database, il che richiede una seconda connessione.
#
# Utente separato e non lo stesso dell'app di proposito: nel database
# clubby_auth vivono le password degli utenti, e il backend applicativo non
# deve potervi accedere nemmeno per errore di configurazione.
set -e

AUTH_DB="${AUTH_DB_NAME:-clubby_auth}"
AUTH_USER="${AUTH_DB_USER:-clubby_auth}"
AUTH_PASSWORD="${AUTH_DB_PASSWORD:-clubby_auth}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
  CREATE USER ${AUTH_USER} WITH PASSWORD '${AUTH_PASSWORD}';
  CREATE DATABASE ${AUTH_DB} OWNER ${AUTH_USER};
EOSQL

# Lo schema viene applicato come utente dell'authorizer, così le tabelle
# nascono già di sua proprietà e non servono GRANT successivi.
PGPASSWORD="$AUTH_PASSWORD" psql -v ON_ERROR_STOP=1 \
  --username "$AUTH_USER" --dbname "$AUTH_DB" \
  --host 127.0.0.1 \
  -f /schema/authorizer-schema.sql

echo "[init-auth-db] Database '${AUTH_DB}' creato e schema applicato."

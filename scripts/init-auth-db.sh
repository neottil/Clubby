#!/bin/bash
# Crea database e utente dell'authorizer, poi vi applica il suo schema.
#
# Solo per l'ambiente locale (docker-compose). Nel cluster i database dei club
# li crea il workflow Infra sull'istanza già in esecuzione, perché l'istanza è
# condivisa e gli script di init girano solo al suo primo avvio.
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
#
# Nessun --host: durante l'inizializzazione Postgres avvia un server temporaneo
# che ascolta SOLO sul socket Unix (listen_addresses=''), quindi una
# connessione a 127.0.0.1 verrebbe rifiutata e farebbe fallire l'intero avvio.
# Sul socket vale l'autenticazione locale trust della fase di init, ma
# PGPASSWORD resta impostata perché lo script funzioni anche se lo si esegue a
# mano su un'istanza già avviata.
PGPASSWORD="$AUTH_PASSWORD" psql -v ON_ERROR_STOP=1 \
  --username "$AUTH_USER" --dbname "$AUTH_DB" \
  -f /schema/authorizer-schema.sql

echo "[init-auth-db] Database '${AUTH_DB}' creato e schema applicato."

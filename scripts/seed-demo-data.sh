#!/bin/bash
# ============================================================
# Popola il database con dati di esempio, per demo e prove manuali.
#
# Account — ruolo nel club e privilegio admin sono indipendenti:
#   istruttore1@clubby.local  istruttore + ADMIN  password: INITIAL_ADMIN_PASSWORD
#   istruttore2@clubby.local  istruttore          password: DEMO_PASSWORD
#   socio1@clubby.local       socio               password: DEMO_PASSWORD
#   socio2@clubby.local       socio               password: DEMO_PASSWORD
#   socio3@clubby.local       socio               password: DEMO_PASSWORD
#
# Ogni account è collegato alla propria scheda socio. C'è inoltre un socio
# "solo gestionale" senza account (Giorgio Ricci), per provare dal pannello
# admin il collegamento manuale di un account registrato in seguito.
#
# Incontri, ognuno con il suo addebito sul voucher del socio:
#   socio1       3 incontri tenuti da istruttore1
#   socio2       3 incontri tenuti da istruttore2 (saldo finale NEGATIVO)
#   istruttore2  2 incontri come socia, tenuti da istruttore1
#   Ricci        1 incontro senza voucher, pagato a parte (compare in Fatturazione)
# Distribuiti negli ultimi due mesi, per provare i filtri per data e i totali
# del Resoconto.
#
# Voucher: socio1 e socio2 acquistati con una ricarica (in Fatturazione);
# istruttore2 con un saldo importato da prima di Clubby (non fatturato).
#
# Tesseramenti, con la quota a 40 €: un socio attivo, uno in scadenza, uno
# scaduto, uno con due rinnovi nello storico e uno mai tesserato (Ricci).
#
# Abilitazioni: istruttore1 a tutte le attività attive; istruttore2 solo a
# Educazione, Dog Dance e Mantrailing — per verificare che un istruttore non
# possa registrare un incontro di un'attività non sua.
#
# Listino: cinque attività attive e una disattivata (Agility), per provare la
# gestione del listino.
#
# Idempotente: a ogni esecuzione rimuove prima i propri account e le proprie
# schede socio (email fisse, vedi sotto) — a cascata anche voucher, incontri e
# movimenti — poi li ricrea. Non tocca altri dati.
#
# Prerequisiti: bash, psql, curl, jq
#
# Variabili (default = ambiente locale via docker-compose):
#   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD   database applicativo
#   AUTH_DB_NAME, AUTH_DB_USER, AUTH_DB_PASSWORD     database degli account
#   AUTH_INTERNAL_URL   URL dell'authorizer (default http://localhost:3001)
#   DEMO_PASSWORD       password degli account non admin (default clubby2026)
#   SEED_ADMIN_PASSWORD password di istruttore1; se assente si usa
#                       INITIAL_ADMIN_PASSWORD dall'ambiente o da authorizer/.env
#
# Uso in locale wsl:
#   AUTH_INTERNAL_URL=http://$(ip route show default | cut -d" " -f3):3001 \
# ./scripts/seed-demo-data.sh
#
# Dentro un pod backend (staging): la password dell'admin non è nell'ambiente
# del backend, va passata esplicitamente:
#   kubectl exec -it <pod-backend> -n <namespace> -- \
#     env SEED_ADMIN_PASSWORD=... bash /app/scripts/seed-demo-data.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-clubby}"
DB_USER="${DB_USER:-clubby}"
DB_PASSWORD="${DB_PASSWORD:-clubby}"

AUTH_INTERNAL_URL="${AUTH_INTERNAL_URL:-http://localhost:3001}"
AUTH_DB_NAME="${AUTH_DB_NAME:-clubby_auth}"
AUTH_DB_USER="${AUTH_DB_USER:-clubby_auth}"
AUTH_DB_PASSWORD="${AUTH_DB_PASSWORD:-clubby_auth}"

DEMO_PASSWORD="${DEMO_PASSWORD:-clubby2026}"

# Password dell'admin: la stessa dell'admin iniziale, così chi ha preparato
# l'ambiente con init-local.sh la conosce già. Letta da authorizer/.env solo se
# non arriva dall'ambiente; con grep -m1 e non "| head", che con pipefail può
# far fallire lo script in modo non deterministico (SIGPIPE).
ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-${INITIAL_ADMIN_PASSWORD:-}}"
if [ -z "$ADMIN_PASSWORD" ] && [ -f "$SCRIPT_DIR/../authorizer/.env" ]; then
  ADMIN_PASSWORD=$(grep -m1 -E '^INITIAL_ADMIN_PASSWORD=' "$SCRIPT_DIR/../authorizer/.env" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true)
fi

# Minimo 10 caratteri: è la regola dell'authorizer (erroreValidazionePassword),
# e controllarla qui evita di scoprirlo a metà, con metà degli account creati.
for coppia in "admin:$ADMIN_PASSWORD" "demo:$DEMO_PASSWORD"; do
  nome="${coppia%%:*}"; valore="${coppia#*:}"
  if [ "${#valore}" -lt 10 ]; then
    echo "ERRORE: la password $nome è assente o più corta di 10 caratteri." >&2
    [ "$nome" = admin ] && echo "  Imposta SEED_ADMIN_PASSWORD o INITIAL_ADMIN_PASSWORD in authorizer/.env." >&2
    exit 1
  fi
done

EMAIL_ISTR1="istruttore1@clubby.local"
EMAIL_ISTR2="istruttore2@clubby.local"
EMAIL_SOCIO1="socio1@clubby.local"
EMAIL_SOCIO2="socio2@clubby.local"
EMAIL_SOCIO3="socio3@clubby.local"
EMAIL_GESTIONALE="giorgio.ricci@clubby.local"

ELENCO_ACCOUNT="'$EMAIL_ISTR1', '$EMAIL_ISTR2', '$EMAIL_SOCIO1', '$EMAIL_SOCIO2', '$EMAIL_SOCIO3'"
ELENCO_SOCI="$ELENCO_ACCOUNT, '$EMAIL_GESTIONALE'"

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

# Registra un account dall'API pubblica, la stessa della pagina di
# registrazione, e ne restituisce l'id. Il corpo JSON è costruito con jq: una
# password con virgolette o barre romperebbe un JSON composto a mano.
registra_utente() {
  local email="$1" password="$2" response http_code body
  response=$(curl -s -w '\n%{http_code}' -X POST "$AUTH_INTERNAL_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg e "$email" --arg p "$password" '{email: $e, password: $p}')")
  http_code="${response##*$'\n'}"
  body="${response%$'\n'*}"
  if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
    echo "ERRORE: registrazione di $email -> HTTP $http_code: $body" >&2
    exit 1
  fi
  echo "$body" | jq -r '.utente.id'
}

# Scheda socio, eventualmente già collegata a un account (6° parametro).
crea_socio() {
  local nome="$1" cognome="$2" email="$3" telefono="$4" mesi="$5" account_id="${6:-}"
  psql_scalar "
    INSERT INTO socio (nome, cognome, email, telefono, data_iscrizione, id_viewer)
    VALUES ('$nome', '$cognome', '$email', '$telefono',
            CURRENT_DATE - INTERVAL '$mesi months',
            $([ -n "$account_id" ] && echo "'$account_id'" || echo NULL))
    RETURNING id;"
}

# Voucher creato 60 giorni fa: prima di qualunque incontro demo, così la lista
# non mostra addebiti anteriori al voucher che li ha pagati. Il secondo
# parametro, facoltativo, è un saldo importato da un voucher già in uso prima
# di Clubby: non è una ricarica e non viene fatturato.
crea_voucher() {
  psql_scalar "
    INSERT INTO voucher (socio_id, saldo_iniziale, data_creazione)
    VALUES ('$1', ${2:-0}, CURRENT_DATE - INTERVAL '60 days')
    RETURNING id;"
}

# Ricarica: credito acquistato dal socio, conteggiato in Fatturazione.
# Parametri: voucher, giorni fa, importo, descrizione.
ricarica() {
  psql_exec "
    INSERT INTO movimento_voucher (voucher_id, tipo, data_movimento, importo, descrizione)
    VALUES ('$1', 'ricarica', CURRENT_DATE - INTERVAL '$2 days', $3, '$4');"
}

# Incontro + addebito sul voucher, con la stessa data dell'incontro, come fa
# createIncontro() nel backend. L'attività si passa per nome e viene risolta
# nel suo id di listino: un nome sbagliato fa fallire subito il vincolo NOT NULL.
# ATTENZIONE: le note finiscono in un letterale SQL fra apici singoli, quindi
# non devono contenere apostrofi.
crea_incontro() {
  local socio_id="$1" voucher_id="$2" giorni="$3" attivita="$4" costo="$5" istruttore_id="$6" \
        note="${7:-}" markdown="${8:-false}"
  local data incontro_id
  data=$(days_ago "$giorni")
  incontro_id=$(psql_scalar "
    INSERT INTO incontro (socio_id, data_incontro, attivita_id, istruttore_id, costo, note, note_markdown)
    VALUES ('$socio_id', '$data', (SELECT id FROM attivita WHERE nome = '$attivita'),
            '$istruttore_id', $costo, $([ -n "$note" ] && echo "'$note'" || echo NULL), $markdown)
    RETURNING id;")
  if [ -n "$voucher_id" ]; then
    psql_exec "
      INSERT INTO movimento_voucher (voucher_id, tipo, incontro_id, data_movimento, importo, descrizione)
      VALUES ('$voucher_id', 'addebito', '$incontro_id', '$data', -$costo, 'Incontro: $attivita');"
  fi
}

# Rinnovo del tesseramento. Parametri: socio, giorni fa del rinnovo, giorni fa
# della scadenza (negativo = scadenza futura), quota.
crea_tesseramento() {
  psql_exec "
    INSERT INTO tesseramento (socio_id, data_rinnovo, scadenza, importo)
    VALUES ('$1', CURRENT_DATE - $2, CURRENT_DATE - ($3), $4);"
}

# ------------------------------------------------------------
# 0. Verifiche preliminari
# ------------------------------------------------------------
echo "▶ Verifico il database ($DB_HOST:$DB_PORT/$DB_NAME)..."
psql_scalar "SELECT 1;" > /dev/null
echo "  OK."

echo "▶ Verifico l'authorizer ($AUTH_INTERNAL_URL)..."
if ! curl -sf "$AUTH_INTERNAL_URL/health" > /dev/null; then
  echo "ERRORE: l'authorizer non risponde su $AUTH_INTERNAL_URL. Avvialo prima di eseguire il seed." >&2
  exit 1
fi
echo "  OK."

# ------------------------------------------------------------
# 1. Pulizia dei dati di una esecuzione precedente
# ------------------------------------------------------------
echo "▶ Rimuovo i dati di esempio di un'esecuzione precedente..."

# Abilitazioni e attribuzioni puntano agli account senza foreign key (stanno in
# un altro database): vanno ripulite PRIMA di eliminare gli account, o
# resterebbero righe orfane.
ID_PRECEDENTI=$(psql_auth_scalar "SELECT COALESCE(string_agg(quote_literal(id::text), ', '), '') FROM utente WHERE email IN ($ELENCO_ACCOUNT);")
if [ -n "$ID_PRECEDENTI" ]; then
  psql_exec "
    DELETE FROM istruttore_attivita WHERE istruttore_id IN ($ID_PRECEDENTI);
    UPDATE incontro SET istruttore_id = NULL WHERE istruttore_id IN ($ID_PRECEDENTI);"
fi

# Refresh token a cascata sugli account; voucher, incontri e movimenti a
# cascata sui soci.
psql_auth_exec "DELETE FROM utente WHERE email IN ($ELENCO_ACCOUNT);"
psql_exec "DELETE FROM socio WHERE email IN ($ELENCO_SOCI);"
echo "  Fatto."

# ------------------------------------------------------------
# 2. Listino attività
# ------------------------------------------------------------
# Configurazione dell'istanza e non dato demo: non viene cancellato, e
# ON CONFLICT lo riallinea senza cambiare gli id a cui gli incontri puntano.
echo "▶ Allineo il listino attività..."
psql_exec "
  INSERT INTO attivita (nome, costo_default, attiva) VALUES
    ('Educazione', 30.00, TRUE),
    ('Mantrailing', 25.00, TRUE),
    ('K9 Cross Training', 35.00, TRUE),
    ('Dog Dance', 20.00, TRUE),
    ('Passeggiata di gruppo', 15.00, TRUE),
    ('Agility', 30.00, FALSE)
  ON CONFLICT (nome) DO UPDATE SET costo_default = EXCLUDED.costo_default, attiva = EXCLUDED.attiva;"
echo "  Fatto."

# ------------------------------------------------------------
# 3. Account
# ------------------------------------------------------------
# Nascono dalla registrazione pubblica come soci senza privilegi; ruolo e
# privilegio si impostano poi sul database degli account, la stessa cosa che
# farebbe un admin dal pannello.
echo "▶ Registro gli account..."
ID_ISTR1=$(registra_utente "$EMAIL_ISTR1" "$ADMIN_PASSWORD")
ID_ISTR2=$(registra_utente "$EMAIL_ISTR2" "$DEMO_PASSWORD")
ID_SOCIO1=$(registra_utente "$EMAIL_SOCIO1" "$DEMO_PASSWORD")
ID_SOCIO2=$(registra_utente "$EMAIL_SOCIO2" "$DEMO_PASSWORD")
ID_SOCIO3=$(registra_utente "$EMAIL_SOCIO3" "$DEMO_PASSWORD")

psql_auth_exec "
  UPDATE utente SET ruolo = 'istruttore', admin = TRUE  WHERE id = '$ID_ISTR1';
  UPDATE utente SET ruolo = 'istruttore', admin = FALSE WHERE id = '$ID_ISTR2';
  UPDATE utente SET ruolo = 'socio',      admin = FALSE WHERE id IN ('$ID_SOCIO1', '$ID_SOCIO2', '$ID_SOCIO3');"
echo "  4 account creati."

# ------------------------------------------------------------
# 4. Schede socio, già collegate agli account
# ------------------------------------------------------------
# L'email di ogni scheda coincide con quella del suo account: è ciò che
# produrrebbe il collegamento fatto dal pannello, che copia l'email
# dell'account sul socio.
echo "▶ Creo le schede socio..."
SOCIO_ISTR1=$(crea_socio 'Uno' 'Istruttore'  "$EMAIL_ISTR1"  '+39 333 1000001' 36 "$ID_ISTR1")
SOCIO_ISTR2=$(crea_socio 'Due' 'Istruttore'  "$EMAIL_ISTR2"  '+39 333 1000002' 24 "$ID_ISTR2")
SOCIO_1=$(crea_socio     'Uno' 'Socio' "$EMAIL_SOCIO1" '+39 333 1000003' 8  "$ID_SOCIO1")
SOCIO_2=$(crea_socio     'Due' 'Socio'  "$EMAIL_SOCIO2" '+39 333 1000004' 5  "$ID_SOCIO2")
SOCIO_3=$(crea_socio     'Tre' 'Socio'  "$EMAIL_SOCIO3" '+39 333 1000005' 12 "$ID_SOCIO3")
SOCIO_GESTIONALE=$(crea_socio 'Giorgio' 'Ricci' "$EMAIL_GESTIONALE" '+39 333 1000006' 18)
echo "  6 schede create (una senza account)."

# ------------------------------------------------------------
# 5. Abilitazioni degli istruttori
# ------------------------------------------------------------
echo "▶ Assegno le abilitazioni..."
psql_exec "
  INSERT INTO istruttore_attivita (istruttore_id, attivita_id)
  SELECT '$ID_ISTR1', id FROM attivita WHERE attiva = TRUE;

  INSERT INTO istruttore_attivita (istruttore_id, attivita_id)
  SELECT '$ID_ISTR2', id FROM attivita WHERE nome IN ('Educazione', 'Dog Dance', 'Mantrailing');"
echo "  Fatto."

# ------------------------------------------------------------
# 6. Voucher
# ------------------------------------------------------------
echo "▶ Creo i voucher..."
# istruttore2: voucher già in uso prima di Clubby, con il saldo importato.
VOUCHER_ISTR2=$(crea_voucher "$SOCIO_ISTR2" 100.00)
# socio1 e socio2: voucher acquistati, cioè attivati con una ricarica.
VOUCHER_1=$(crea_voucher "$SOCIO_1")
ricarica "$VOUCHER_1" 60 150.00 'Acquisto voucher'
VOUCHER_2=$(crea_voucher "$SOCIO_2")
ricarica "$VOUCHER_2" 60 40.00 'Acquisto voucher'
ricarica "$VOUCHER_2" 35 30.00 'Ricarica voucher'
echo "  Fatto."

# ------------------------------------------------------------
# 7. Incontri
# ------------------------------------------------------------
echo "▶ Creo gli incontri e i relativi addebiti..."

NOTA_MD_MANTRAILING="## Mantrailing - incontro individuale

Obiettivi della sessione:

* riconoscimento **odore di riferimento**
* pista su asfalto con distrazioni leggere
* ~~pista in bosco~~ rimandata alla prossima volta

> Buona motivazione, partenza sicura.

| Prova | Esito |
| --- | --- |
| Pista breve | OK |
| Pista lunga | Da ripetere |"

NOTA_MD_K9="### K9 Cross Training - percorso a 3 stazioni

1. riscaldamento
2. passo laterale
3. defaticamento

Il **passo laterale** va ripreso: appoggio posteriore ancora incerto."

# socio1 (Paolo Ferrari), tenuti da istruttore1. Saldo: 150 - 30 - 25 - 35 = 60
crea_incontro "$SOCIO_1" "$VOUCHER_1" 50 'Educazione'        30.00 "$ID_ISTR1" 'Primo incontro di valutazione'
crea_incontro "$SOCIO_1" "$VOUCHER_1" 22 'Mantrailing'       25.00 "$ID_ISTR1" "$NOTA_MD_MANTRAILING" true
crea_incontro "$SOCIO_1" "$VOUCHER_1" 6  'K9 Cross Training' 35.00 "$ID_ISTR1"

# socio2 (Sara Romano), tenuti da istruttore2. Saldo: 40 + 30 - 30 - 20 - 25 = -5
crea_incontro "$SOCIO_2" "$VOUCHER_2" 45 'Educazione'  30.00 "$ID_ISTR2" 'Lavoro sul richiamo'
crea_incontro "$SOCIO_2" "$VOUCHER_2" 26 'Dog Dance'   20.00 "$ID_ISTR2"
crea_incontro "$SOCIO_2" "$VOUCHER_2" 4  'Mantrailing' 25.00 "$ID_ISTR2" 'Pista breve in parco'

# istruttore2 (Chiara Conti) come socia, tenuti da istruttore1. Saldo: 100 - 35 - 15 = 50
crea_incontro "$SOCIO_ISTR2" "$VOUCHER_ISTR2" 30 'K9 Cross Training'     35.00 "$ID_ISTR1" "$NOTA_MD_K9" true
crea_incontro "$SOCIO_ISTR2" "$VOUCHER_ISTR2" 12 'Passeggiata di gruppo' 15.00 "$ID_ISTR1"
# Ricci, senza voucher: l'incontro si paga a parte e compare in Fatturazione.
crea_incontro "$SOCIO_GESTIONALE" "" 15 'Educazione' 30.00 "$ID_ISTR1" 'Pagato a parte, senza voucher'
echo "  9 incontri creati."

# ------------------------------------------------------------
# 8. Tesseramenti
# ------------------------------------------------------------
echo "▶ Imposto la quota e registro i tesseramenti..."
psql_exec "
  INSERT INTO impostazione (chiave, valore) VALUES ('quota_tesseramento', '40.00')
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore, updated_at = NOW();"

# Galli: attivo, scade fra 65 giorni
crea_tesseramento "$SOCIO_ISTR1" 300 -65 40.00
# Conti: in scadenza fra 20 giorni
crea_tesseramento "$SOCIO_ISTR2" 345 -20 40.00
# Ferrari: scaduto da 35 giorni, con la quota dell'anno prima
crea_tesseramento "$SOCIO_1" 400 35 35.00
# Romano: due rinnovi; l'ultimo scade fra 5 giorni
crea_tesseramento "$SOCIO_2" 730 365 35.00
crea_tesseramento "$SOCIO_2" 360 -5 40.00
# Ricci: mai tesserato
echo "  5 rinnovi registrati."

# ------------------------------------------------------------
# Riepilogo, letto dal database e non scritto a mano
# ------------------------------------------------------------
echo ""
echo "=== Fatto ==="
echo ""
echo "Account:"
echo "  $EMAIL_ISTR1  istruttore + admin   password: quella di INITIAL_ADMIN_PASSWORD"
echo "  $EMAIL_ISTR2  istruttore           password: $DEMO_PASSWORD"
echo "  $EMAIL_SOCIO1       socio                password: $DEMO_PASSWORD"
echo "  $EMAIL_SOCIO2       socio                password: $DEMO_PASSWORD"
echo "  $EMAIL_SOCIO3       socio                password: $DEMO_PASSWORD"
echo ""
echo "Saldi voucher:"
psql_righe "
  SELECT '  ' || s.cognome || ' ' || s.nome,
         to_char(v.saldo_iniziale + COALESCE(SUM(m.importo), 0), 'FM999990.00')
  FROM voucher v
  JOIN socio s ON s.id = v.socio_id
  LEFT JOIN movimento_voucher m ON m.voucher_id = v.id
  WHERE s.email IN ($ELENCO_SOCI)
  GROUP BY s.cognome, s.nome, v.saldo_iniziale
  ORDER BY 1;"
echo ""
echo "Incontri per socio:"
psql_righe "
  SELECT '  ' || s.cognome || ' ' || s.nome, COUNT(i.id)
  FROM socio s LEFT JOIN incontro i ON i.socio_id = s.id
  WHERE s.email IN ($ELENCO_SOCI)
  GROUP BY s.cognome, s.nome
  ORDER BY 1;"
echo ""
echo "Tesseramenti (ultima scadenza):"
psql_righe "
  SELECT '  ' || s.cognome || ' ' || s.nome,
         COALESCE(to_char(MAX(t.scadenza), 'YYYY-MM-DD'), 'mai tesserato')
  FROM socio s LEFT JOIN tesseramento t ON t.socio_id = s.id
  WHERE s.email IN ($ELENCO_SOCI)
  GROUP BY s.cognome, s.nome
  ORDER BY 1;"
echo ""

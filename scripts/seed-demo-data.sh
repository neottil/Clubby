#!/bin/bash
# ============================================================
# AZZERA il database e lo ripopola con dati di esempio, per demo e prove
# manuali.
#
# ATTENZIONE: non è una "pulizia dei propri dati". Svuota OGNI tabella dei due
# database — soci, incontri, voucher, ricevute, impostazioni e account — e
# ricostruisce tutto da zero. Chiede conferma esplicita, a meno di SEED_FORZA=1.
# Non va mai puntato a un ambiente che contiene dati veri.
#
# L'admin iniziale viene cancellato e RICREATO qui, con la stessa email e la
# stessa password: l'authorizer lo rigenererebbe solo trovando il database
# degli account vuoto al proprio avvio, quindi senza ricrearlo si resterebbe
# senza nessuno con cui entrare fino al riavvio del servizio.
#
# Account — ruolo nel club e privilegio admin sono INDIPENDENTI, e la demo lo
# mostra tenendoli su account diversi: chi amministra non insegna, chi insegna
# non amministra.
#   admin@clubby.local         ADMIN, senza scheda socio  password: INITIAL_ADMIN_PASSWORD
#   marco.bianchi@clubby.dev   istruttore                 password: DEMO_PASSWORD
#   elena.ferrari@clubby.dev   istruttore                 password: DEMO_PASSWORD
#   luca.moretti@clubby.dev    socio                      password: DEMO_PASSWORD
#   giulia.rinaldi@clubby.dev  socio                      password: DEMO_PASSWORD
#   davide.costa@clubby.dev    socio                      password: DEMO_PASSWORD
#   sara.vitali@clubby.dev     socio, SENZA voucher       password: DEMO_PASSWORD
#
# Tranne l'admin, ogni account è collegato alla propria scheda socio. C'è
# inoltre un socio "solo gestionale" senza account (Paolo Greco), per provare
# dalle Impostazioni il collegamento manuale di un account registrato dopo.
#
# Vitali ha un account ma nessun voucher, e paga gli incontri a parte: è il
# caso della spec 004, in cui il socio arriva alle proprie ricevute solo dalla
# riga dell'incontro. Senza un account con cui entrare non si potrebbe provare.
#
# Incontri, ognuno con il suo addebito sul voucher del socio. Una decina a
# testa: con due o tre, la pagina Incontri e i filtri per data si guardano
# senza capire se funzionano.
#   Moretti   11 incontri tenuti da Bianchi
#   Rinaldi   11 incontri tenuti da Ferrari (saldo finale NEGATIVO)
#   Costa     22 incontri tenuti da Bianchi, su sette mesi
#   Ferrari   11 incontri come socia, tenuti da Bianchi
#   Vitali    11 incontri senza voucher, pagati a parte (compaiono in Ricevute)
#   Greco     nessun incontro: socio appena iscritto, ancora senza dati
# Distribuiti negli ultimi mesi, per provare i filtri per data e i totali del
# Resoconto.
#
# Costa e il caso "tanti dati", e serve a provare cio che con pochi record non
# si vede: 40 ricariche e 22 addebiti gli danno 62 movimenti (paginati a 25),
# e i suoi incontri portano il Resoconto di Bianchi a 29 righe. E' li che
# si verifica la cosa piu delicata della selezione multipla: spuntare le prime
# venticinque, premere "Carica altri" e ritrovarle ancora scelte.
#
# Voucher: Moretti e Rinaldi acquistati con una ricarica e poi ricaricati
# durante l'anno (tutte voci in Ricevute); Ferrari con il SOLO saldo importato
# da prima di Clubby, che muove il saldo ma non e' un incasso;
# Costa aperto sette mesi fa, con una ricarica promozionale che accredita 30
# a fronte di 25 pagati — in Ricevute devono comparire i 25.
#
# Rendicontazione e ricevute: cio che e abbastanza vecchio risulta gia
# chiuso, cosi entrambe le funzionalita hanno da subito i due stati. Gli
# incontri anteriori a 40 giorni sono rendicontati; sono gia documentate le
# ricariche anteriori a 180 giorni, i tesseramenti anteriori a 300 e gli
# incontri senza voucher anteriori a 100. Ogni istruttore conserva comunque
# incontri ancora da rendicontare, che e il caso di partenza della pagina.
# Attenzione: un incontro rendicontato o documentato non si puo piu modificare
# ne eliminare — e voluto, ed e il comportamento da provare.
#
# Tesseramenti, con la quota a 20 €: due soci attivi, uno in scadenza, uno
# scaduto, uno con due rinnovi nello storico e due mai tesserati (Vitali e
# Greco).
#
# Ricevute dimostrative: DUE vere, con il PDF prodotto dallo stesso codice
# dell'applicazione, l'intestazione e il piè di pagina scritti nelle
# impostazioni e il logo indicato da LOGO_FILE (default clubby_local.png).
# Una su una ricarica (il socio la ritrova fra i movimenti del voucher) e una
# su un incontro di Vitali, che un voucher non ce l'ha: per lei quella riga e'
# l'unico modo di arrivare alla propria ricevuta.
#
# Abilitazioni: Bianchi a tutte le attività attive; Ferrari solo a
# Educazione, Dog Dance e Mantrailing — per verificare che un istruttore non
# possa registrare un incontro di un'attività non sua.
#
# Listino: cinque attività attive e una disattivata (Agility), per provare la
# gestione del listino.
#
# Ripetibile: ogni esecuzione riparte da un database vuoto, quindi il risultato
# non dipende da cosa c'era prima.
#
# Prerequisiti: bash, psql, curl, jq, e node per la sola ricevuta dimostrativa
# (in WSL, dove node non c'è, viene usato node.exe se disponibile).
#
# Variabili (default = ambiente locale via docker-compose):
#   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD   database applicativo
#   AUTH_DB_NAME, AUTH_DB_USER, AUTH_DB_PASSWORD     database degli account
#   AUTH_INTERNAL_URL   URL dell'authorizer (default http://localhost:3001)
#   DEMO_PASSWORD       password degli account non admin (default clubby2026)
#   SEED_ADMIN_PASSWORD password dell'admin; se assente si usa
#                       INITIAL_ADMIN_PASSWORD dall'ambiente o da authorizer/.env
#   INITIAL_ADMIN_EMAIL email dell'admin; se assente si legge da
#                       authorizer/.env, altrimenti admin@clubby.local
#   LOGO_FILE           logo stampato sulla ricevuta (default clubby_local.png)
#   SEED_FORZA=1        salta la conferma interattiva dell'azzeramento
#
# Uso in locale wsl:
#   AUTH_INTERNAL_URL=http://$(ip route show default | cut -d" " -f3):3001 \
# ./scripts/seed-demo-data.sh
#
# Lo script sta FUORI dall'immagine Docker del backend, di proposito: azzera
# due database interi, e una cosa del genere non deve trovarsi a portata di
# `kubectl exec` su un pod di staging. Si esegue dalla propria macchina,
# puntando esplicitamente al database che si vuole distruggere.
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

# Email e password dell'admin: le stesse dell'admin iniziale, così chi ha
# preparato l'ambiente con init-local.sh le conosce già. Lette da
# authorizer/.env solo se non arrivano dall'ambiente; con grep -m1 e non
# "| head", che con pipefail può far fallire lo script in modo non
# deterministico (SIGPIPE).
#
# Un'email diversa da quella dell'authorizer non darebbe un errore: darebbe due
# admin, quello del seed e quello che il servizio ricrea al primo avvio con il
# database vuoto — e le istruzioni, Bruno e i README punterebbero al secondo.
leggi_env() {
  [ -f "$SCRIPT_DIR/../authorizer/.env" ] || return 0
  grep -m1 -E "^$1=" "$SCRIPT_DIR/../authorizer/.env" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true
}

ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-${INITIAL_ADMIN_PASSWORD:-}}"
if [ -z "$ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD=$(leggi_env INITIAL_ADMIN_PASSWORD)
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

# Logo stampato sulla ricevuta dimostrativa. La cartella è quella del
# repository e non `process.cwd()/branding`: lo script deve funzionare da
# qualunque directory lo si lanci.
LOGO_FILE="${LOGO_FILE:-clubby_local.png}"
BRANDING_DIR="${BRANDING_DIR:-$SCRIPT_DIR/../branding}"

# Nomi e cognomi verosimili, e email nome.cognome@clubby.dev: una demo con
# "Socio Uno" e "socio1@" si legge come un test, e a chi la guarda per capire
# il prodotto ricorda a ogni riga che i dati sono finti.
NOME_ISTR1='Marco';  COGNOME_ISTR1='Bianchi'
NOME_ISTR2='Elena';  COGNOME_ISTR2='Ferrari'
NOME_SOCIO1='Luca';   COGNOME_SOCIO1='Moretti'
NOME_SOCIO2='Giulia'; COGNOME_SOCIO2='Rinaldi'
NOME_SOCIO3='Davide'; COGNOME_SOCIO3='Costa'
NOME_SOCIO4='Sara';   COGNOME_SOCIO4='Vitali'
# Socio "solo gestionale", senza account: serve a provare dalle Impostazioni il
# collegamento manuale di un account registrato in seguito. Prima il ruolo era
# di Sara Vitali; da quando anche lei ha un account, quel caso resterebbe
# scoperto, e senza qualcuno in quello stato la funzione non si vede.
NOME_GEST='Paolo';    COGNOME_GEST='Greco'

# L'amministratore è un account a sé, senza scheda socio: amministra il club,
# non lo frequenta. È lo stesso admin iniziale dell'authorizer — email e
# password comprese — perché l'azzeramento lo cancella e il servizio lo ricrea
# solo se trova il database degli account vuoto al proprio avvio: senza questa
# riga ci si ritroverebbe senza nessuno con cui entrare.
EMAIL_ADMIN="${INITIAL_ADMIN_EMAIL:-$(leggi_env INITIAL_ADMIN_EMAIL)}"
EMAIL_ADMIN="${EMAIL_ADMIN:-admin@clubby.local}"

EMAIL_ISTR1="marco.bianchi@clubby.dev"
EMAIL_ISTR2="elena.ferrari@clubby.dev"
EMAIL_SOCIO1="luca.moretti@clubby.dev"
EMAIL_SOCIO2="giulia.rinaldi@clubby.dev"
EMAIL_SOCIO3="davide.costa@clubby.dev"
EMAIL_SOCIO4="sara.vitali@clubby.dev"
EMAIL_GESTIONALE="paolo.greco@clubby.dev"

# Le email dei SOCI, non degli account: l'admin non ha una scheda socio e non
# compare qui, mentre Greco c'è pur non avendo un account. Serve ai passi che
# marcano rendicontato/documentato ciò che è abbastanza vecchio.
ELENCO_SOCI="'$EMAIL_ISTR1', '$EMAIL_ISTR2', '$EMAIL_SOCIO1', '$EMAIL_SOCIO2', '$EMAIL_SOCIO3', '$EMAIL_SOCIO4', '$EMAIL_GESTIONALE'"

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
#
# Terzo parametro "riusa": accetta un account che esiste già invece di
# fallire. Serve al solo admin — vedi il commento alla sua registrazione.
registra_utente() {
  local email="$1" password="$2" riusa="${3:-}" response http_code body id
  response=$(curl -s -w '\n%{http_code}' -X POST "$AUTH_INTERNAL_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg e "$email" --arg p "$password" '{email: $e, password: $p}')")
  http_code="${response##*$'\n'}"
  body="${response%$'\n'*}"

  # 409 = email già presente. Ma il database degli account è stato svuotato
  # poche righe sopra, e il controllo dei residui è passato: se qualcuno c'è,
  # è comparso dopo, e le cause sono due (vedi sotto).
  if [ "$http_code" = "409" ]; then
    id=$(psql_auth_scalar "SELECT id FROM utente WHERE email = '$email';")
    if [ -n "$riusa" ] && [ -n "$id" ]; then
      echo "  $email esisteva già: ricreato dall'authorizer al proprio avvio, lo riuso." >&2
      printf '%s\n' "$id"
      return 0
    fi
    echo "ERRORE: $email risulta già registrato, ma il database degli account è stato" >&2
    echo "  appena svuotato e ricontrollato. Due cause possibili:" >&2
    echo "  1) l'authorizer si è riavviato dopo l'azzeramento e ha ricreato l'admin" >&2
    echo "     iniziale INITIAL_ADMIN_EMAIL; in quel caso rieseguire il seed basta." >&2
    echo "  2) AUTH_INTERNAL_URL ($AUTH_INTERNAL_URL) e AUTH_DB_* ($AUTH_DB_NAME)" >&2
    echo "     puntano a due installazioni diverse: il seed svuota un database e" >&2
    echo "     registra gli account su un altro." >&2
    exit 1
  fi

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
# di Clubby: non è una ricarica e non e documentabile.
# Il terzo parametro, facoltativo, sposta indietro la data di creazione: serve
# al socio con lo storico lungo, i cui movimenti sono anteriori ai 60 giorni.
crea_voucher() {
  psql_scalar "
    INSERT INTO voucher (socio_id, saldo_iniziale, data_creazione)
    VALUES ('$1', ${2:-0}, CURRENT_DATE - INTERVAL '${3:-60} days')
    RETURNING id;"
}

# Ricarica: credito acquistato dal socio, conteggiato in Ricevute.
# Parametri: voucher, giorni fa, importo accreditato, descrizione, e come
# quinto — facoltativo — l'importo davvero PAGATO, quando è minore di quello
# accreditato (RECHARGE_MODE percentage/map). È il valore che compare in
# Ricevute: il credito in più è uno sconto, non denaro incassato.
ricarica() {
  psql_exec "
    INSERT INTO movimento_voucher (voucher_id, tipo, data_movimento, importo, importo_pagato, descrizione)
    VALUES ('$1', 'ricarica', CURRENT_DATE - INTERVAL '$2 days', $3, ${5:-NULL}, '$4');"
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
# Di entrambi i database non si verifica solo la raggiungibilità, ma che
# contengano le tabelle che dovrebbero avere — e PRIMA di distruggere
# qualcosa. Puntare al database sbagliato non dava errore: l'azzeramento non
# trovava tabelle da svuotare e veniva saltato in silenzio (il passo tratta
# "nessuna tabella" come "database già vuoto"), il seed proseguiva a registrare
# gli account su un'installazione mai azzerata, e la cosa emergeva molto più
# avanti come un 409 sulla prima registrazione.
echo "▶ Verifico il database dei dati ($DB_USER@$DB_HOST:$DB_PORT/$DB_NAME)..."
if [ "$(psql_scalar "SELECT to_regclass('public.socio') IS NOT NULL;")" != "t" ]; then
  echo "ERRORE: nel database $DB_NAME non esiste la tabella 'socio'." >&2
  echo "  Non è il database applicativo di Clubby, oppure lo schema non è stato applicato." >&2
  echo "  Controlla DB_NAME, DB_USER e DB_HOST." >&2
  exit 1
fi
echo "  OK."

echo "▶ Verifico il database degli account ($AUTH_DB_USER@$DB_HOST:$DB_PORT/$AUTH_DB_NAME)..."
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
# L'admin è l'unico che può esistere già senza che sia un errore: l'authorizer
# ricrea INITIAL_ADMIN_EMAIL al proprio avvio se trova il database degli account
# vuoto (avvioIniziale in authorizer/src/server.ts), e fra l'azzeramento e
# questa riga un riavvio del pod è tutt'altro che improbabile — in cluster lo
# provoca anche solo un rollout. È comunque lo stesso account, con la stessa
# email e la stessa password, quindi si riusa invece di fallire.
ID_ADMIN=$(registra_utente "$EMAIL_ADMIN" "$ADMIN_PASSWORD" riusa)

# L'id arriva dall'authorizer raggiunto via HTTP; se non si trova nel database
# che abbiamo appena svuotato, i due non sono la stessa installazione. Meglio
# dirlo qui che lasciare che i passi seguenti aggiornino zero righe in silenzio.
if [ "$(psql_auth_scalar "SELECT COUNT(*) FROM utente WHERE id = '$ID_ADMIN';")" != "1" ]; then
  echo "ERRORE: l'account creato via $AUTH_INTERNAL_URL non si trova in $AUTH_DB_NAME." >&2
  echo "  AUTH_INTERNAL_URL e AUTH_DB_* puntano a due installazioni diverse." >&2
  exit 1
fi
ID_ISTR1=$(registra_utente "$EMAIL_ISTR1" "$DEMO_PASSWORD")
ID_ISTR2=$(registra_utente "$EMAIL_ISTR2" "$DEMO_PASSWORD")
ID_SOCIO1=$(registra_utente "$EMAIL_SOCIO1" "$DEMO_PASSWORD")
ID_SOCIO2=$(registra_utente "$EMAIL_SOCIO2" "$DEMO_PASSWORD")
ID_SOCIO3=$(registra_utente "$EMAIL_SOCIO3" "$DEMO_PASSWORD")
ID_SOCIO4=$(registra_utente "$EMAIL_SOCIO4" "$DEMO_PASSWORD")

# Il privilegio admin sta su UN account solo, che non è un istruttore: ruolo nel
# club e amministrazione sono indipendenti, e tenerli separati nella demo è il
# modo più diretto di mostrarlo. Gli istruttori restano istruttori e basta —
# così si vede davvero cosa può fare un istruttore senza privilegi.
# cambio_password_richiesto = FALSE anche sull'admin: se è stato ricreato
# dall'authorizer è nato con l'obbligo di cambiare la password al primo
# accesso, e in una demo quell'obbligo è solo un intoppo — la password di
# quell'account la conosce chi ha lanciato il seed.
psql_auth_exec "
  UPDATE utente SET ruolo = 'socio',      admin = TRUE,  cambio_password_richiesto = FALSE WHERE id = '$ID_ADMIN';
  UPDATE utente SET ruolo = 'istruttore', admin = FALSE WHERE id IN ('$ID_ISTR1', '$ID_ISTR2');
  UPDATE utente SET ruolo = 'socio',      admin = FALSE WHERE id IN ('$ID_SOCIO1', '$ID_SOCIO2', '$ID_SOCIO3', '$ID_SOCIO4');"
echo "  7 account creati (1 amministratore, 2 istruttori, 4 soci)."

# ------------------------------------------------------------
# 4. Schede socio, già collegate agli account
# ------------------------------------------------------------
# L'email di ogni scheda coincide con quella del suo account: è ciò che
# produrrebbe il collegamento fatto dal pannello, che copia l'email
# dell'account sul socio.
echo "▶ Creo le schede socio..."
SOCIO_ISTR1=$(crea_socio "$NOME_ISTR1"   "$COGNOME_ISTR1"   "$EMAIL_ISTR1"      '+39 333 1000001' 36 "$ID_ISTR1")
SOCIO_ISTR2=$(crea_socio "$NOME_ISTR2"   "$COGNOME_ISTR2"   "$EMAIL_ISTR2"      '+39 333 1000002' 24 "$ID_ISTR2")
SOCIO_1=$(crea_socio     "$NOME_SOCIO1"  "$COGNOME_SOCIO1"  "$EMAIL_SOCIO1"     '+39 333 1000003' 8  "$ID_SOCIO1")
SOCIO_2=$(crea_socio     "$NOME_SOCIO2"  "$COGNOME_SOCIO2"  "$EMAIL_SOCIO2"     '+39 333 1000004' 5  "$ID_SOCIO2")
SOCIO_3=$(crea_socio     "$NOME_SOCIO3"  "$COGNOME_SOCIO3"  "$EMAIL_SOCIO3"     '+39 333 1000005' 12 "$ID_SOCIO3")
# Vitali ha un account ma NON un voucher: paga gli incontri a parte. È il caso
# della spec 004 — un socio che non compra credito arriva alle proprie ricevute
# solo dalla riga dell'incontro, e senza un account con cui entrare quel
# percorso non si potrebbe provare.
SOCIO_4=$(crea_socio     "$NOME_SOCIO4"  "$COGNOME_SOCIO4"  "$EMAIL_SOCIO4"     '+39 333 1000006' 18 "$ID_SOCIO4")
# Greco: scheda senza account, per il collegamento manuale dalle Impostazioni.
# L'id non serve a nessuno più sotto — non ha né voucher né incontri — ma va
# comunque scartato, o finirebbe a schermo in mezzo ai messaggi.
crea_socio "$NOME_GEST" "$COGNOME_GEST" "$EMAIL_GESTIONALE" '+39 333 1000007' 2 > /dev/null
echo "  7 schede create (una senza account)."

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
# Ferrari: voucher già in uso prima di Clubby, con il SOLO saldo importato e
# nessuna ricarica. È il caso che dimostra la distinzione: il credito importato
# muove il saldo ma non è un incasso, quindi non compare fra le voci
# documentabili. Il suo importo copre i dieci incontri che fa come socia.
VOUCHER_ISTR2=$(crea_voucher "$SOCIO_ISTR2" 300.00)

# Moretti e Rinaldi: voucher acquistati, cioè attivati con una ricarica, e poi
# ricaricati durante l'anno come farebbe chi consuma il credito.
VOUCHER_1=$(crea_voucher "$SOCIO_1" 0 200)
ricarica "$VOUCHER_1" 195 150.00 'Acquisto voucher'
ricarica "$VOUCHER_1" 120 100.00 'Ricarica voucher'
ricarica "$VOUCHER_1" 45  80.00 'Ricarica voucher'

# Rinaldi chiude in NEGATIVO di proposito: il saldo può andare sotto zero
# quando si registrano incontri oltre il credito, e l'interfaccia deve
# mostrarlo invece di impedirlo a posteriori.
VOUCHER_2=$(crea_voucher "$SOCIO_2" 0 200)
ricarica "$VOUCHER_2" 195 40.00 'Acquisto voucher'
ricarica "$VOUCHER_2" 130 100.00 'Ricarica voucher'
ricarica "$VOUCHER_2" 60  80.00 'Ricarica voucher'
ricarica "$VOUCHER_2" 20  30.00 'Ricarica voucher'

# Costa: il caso "tanti dati". Voucher aperto sette mesi fa e ricaricato di
# continuo con importi piccoli — il socio che passa spesso e paga poco per
# volta. Serve a provare ciò che con pochi record non si vede: la paginazione
# dei movimenti, quella di Ricevute e la selezione che deve sopravvivere a
# "Carica altri".
VOUCHER_3=$(crea_voucher "$SOCIO_3" 0 260)
# 40 ricariche ogni sei giorni: quante bastano perche, tolte quelle gia
# documentate piu sotto, ne restino comunque piu di 25 da documentare — cioe
# perche la paginazione si veda nella vista predefinita e non solo accendendo
# l interruttore.
GIORNI=246
for _ in $(seq 1 40); do
  if [ "$GIORNI" -eq 150 ]; then
    # Una sola con valore extra: accreditati 30, pagati 25. Fra le voci
    # devono comparire i 25, sul voucher i 30.
    ricarica "$VOUCHER_3" "$GIORNI" 30.00 'Ricarica promozionale' 25.00
  else
    ricarica "$VOUCHER_3" "$GIORNI" 25.00 'Ricarica voucher'
  fi
  GIORNI=$((GIORNI - 6))
done
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

# Ogni socio ha una decina di incontri: con due o tre, la pagina Incontri e i
# filtri per data si guardano senza capire se funzionano. I cicli qui sotto
# distribuiscono attività e costi in modo che ogni socio abbia incontri vecchi
# (rendicontati e documentati) e recenti (ancora aperti).
ATTIVITA_CICLO=('Educazione' 'Mantrailing' 'K9 Cross Training' 'Dog Dance' 'Passeggiata di gruppo')
COSTO_CICLO=(30.00 25.00 35.00 20.00 15.00)

# Ferrari è abilitata a tre sole attività: i suoi incontri devono restare in
# quell'insieme, o il backend li rifiuterebbe se li si registrasse dall'API.
ATTIVITA_FERRARI=('Educazione' 'Dog Dance' 'Mantrailing')
COSTO_FERRARI=(30.00 20.00 25.00)

# Crea N incontri distribuiti nel tempo, a partire da "giorni fa" e
# retrocedendo di un passo fisso. Parametri: socio, voucher (vuoto = nessuno),
# istruttore, quanti, giorni di partenza, passo, nome array attività, nome
# array costi. Gli array si passano per NOME e si leggono con l'indiretto di
# bash, che è l'unico modo di passare un array a una funzione.
serie_incontri() {
  local socio="$1" voucher="$2" istruttore="$3" quanti="$4" giorni="$5" passo="$6"
  local nomi="$7[@]" costi="$8[@]"
  local -a att=("${!nomi}") cos=("${!costi}")
  local n idx
  for n in $(seq 0 $((quanti - 1))); do
    idx=$((n % ${#att[@]}))
    crea_incontro "$socio" "$voucher" "$giorni" "${att[$idx]}" "${cos[$idx]}" "$istruttore"
    giorni=$((giorni - passo))
  done
}

# Moretti, tenuti da Bianchi. Due con le note scritte a mano (una in Markdown,
# per provare il visualizzatore), gli altri dal ciclo.
crea_incontro "$SOCIO_1" "$VOUCHER_1" 50 'Educazione'  30.00 "$ID_ISTR1" 'Primo incontro di valutazione'
crea_incontro "$SOCIO_1" "$VOUCHER_1" 22 'Mantrailing' 25.00 "$ID_ISTR1" "$NOTA_MD_MANTRAILING" true
serie_incontri "$SOCIO_1" "$VOUCHER_1" "$ID_ISTR1" 9 188 19 ATTIVITA_CICLO COSTO_CICLO

# Rinaldi, tenuti da Ferrari: solo le attività a cui è abilitata.
crea_incontro "$SOCIO_2" "$VOUCHER_2" 45 'Educazione'  30.00 "$ID_ISTR2" 'Lavoro sul richiamo'
crea_incontro "$SOCIO_2" "$VOUCHER_2" 4  'Mantrailing' 25.00 "$ID_ISTR2" 'Pista breve in parco'
serie_incontri "$SOCIO_2" "$VOUCHER_2" "$ID_ISTR2" 9 190 20 ATTIVITA_FERRARI COSTO_FERRARI

# Ferrari come socia, tenuti da Bianchi: un istruttore è prima di tutto un
# socio, e deve vedere i propri incontri accanto a quelli che tiene.
crea_incontro "$SOCIO_ISTR2" "$VOUCHER_ISTR2" 30 'K9 Cross Training' 35.00 "$ID_ISTR1" "$NOTA_MD_K9" true
serie_incontri "$SOCIO_ISTR2" "$VOUCHER_ISTR2" "$ID_ISTR1" 10 196 20 ATTIVITA_CICLO COSTO_CICLO

# Vitali, senza voucher: gli incontri si pagano a parte e compaiono in
# Ricevute come voci di tipo "incontro". Sono distribuiti a cavallo dei 100
# giorni, la soglia oltre la quale più sotto vengono segnati come documentati:
# così lo stesso socio ha voci in entrambi gli stati.
crea_incontro "$SOCIO_4" "" 15 'Educazione' 30.00 "$ID_ISTR1" 'Pagato a parte, senza voucher'
serie_incontri "$SOCIO_4" "" "$ID_ISTR1" 10 200 20 ATTIVITA_CICLO COSTO_CICLO

# Greco non ha né account né incontri: è appena entrato nel club. Oltre al
# collegamento manuale, mostra come si presenta un socio ancora senza dati.

# Costa: 22 incontri in sette mesi, tutti tenuti da Bianchi. Portano il
# suo Resoconto oltre le 25 righe, che è l'unico modo di provare davvero la
# selezione multipla: spuntare i primi venticinque, caricare gli altri e
# verificare che i primi siano ancora scelti.
serie_incontri "$SOCIO_3" "$VOUCHER_3" "$ID_ISTR1" 22 185 8 ATTIVITA_CICLO COSTO_CICLO

echo "  $(psql_scalar "SELECT COUNT(*) FROM incontro;") incontri creati."

# ------------------------------------------------------------
# 8. Tesseramenti
# ------------------------------------------------------------
echo "▶ Imposto la quota e registro i tesseramenti..."
psql_exec "
  INSERT INTO impostazione (chiave, valore) VALUES ('quota_tesseramento', '20.00')
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore, updated_at = NOW();"

# Bianchi: attivo, scade fra 65 giorni
crea_tesseramento "$SOCIO_ISTR1" 300 -65 20.00
# Ferrari: in scadenza fra 20 giorni
crea_tesseramento "$SOCIO_ISTR2" 345 -20 20.00
# Moretti: scaduto da 35 giorni, con la quota dell'anno prima — resta piu bassa
# dell'attuale, cosi lo storico mostra un importo diverso da quello in vigore.
crea_tesseramento "$SOCIO_1" 400 35 15.00
# Rinaldi: due rinnovi; l'ultimo scade fra 5 giorni
crea_tesseramento "$SOCIO_2" 730 365 15.00
crea_tesseramento "$SOCIO_2" 360 -5 20.00
# Costa: attivo, scade fra 100 giorni
crea_tesseramento "$SOCIO_3" 265 -100 20.00
# Vitali: mai tesserata
echo "  6 rinnovi registrati."

# ------------------------------------------------------------
# 9. Rendicontazione e voci gia documentate
# ------------------------------------------------------------
# Senza qualche riga gia chiusa, le due funzionalita si vedono solo a meta:
# l'interruttore "mostra anche i gia rendicontati/documentati" non avrebbe niente
# da mostrare, e la casella spuntata e bloccata non comparirebbe mai.
#
# Il criterio e l'eta: si considera chiuso cio che e abbastanza vecchio da
# essere gia passato in un conteggio precedente. Ogni istruttore resta con una
# parte ancora da rendicontare, che e il caso di partenza della pagina.
echo "▶ Segno come rendicontati gli incontri piu vecchi di 40 giorni..."
psql_exec "
  UPDATE incontro
     SET rendicontato_il = data_incontro + INTERVAL '7 days'
   WHERE data_incontro < CURRENT_DATE - 40
     AND socio_id IN (SELECT id FROM socio WHERE email IN ($ELENCO_SOCI));"

echo "▶ Segno come gia documentate le voci piu vecchie..."
# Il riferimento e polimorfico (tipo, id) e punta a tre tabelle diverse: qui si
# scrive una riga per ciascuna delle tre fonti, cosi la pagina Ricevute ha
# un esempio gia emesso per ogni tipo di voce.
psql_exec "
  INSERT INTO documento_emesso_voce (tipo, riferimento_id, emessa_il)
  SELECT 'ricarica', m.id, m.data_movimento + INTERVAL '3 days'
    FROM movimento_voucher m
    JOIN voucher v ON v.id = m.voucher_id
    JOIN socio s ON s.id = v.socio_id
   WHERE m.tipo = 'ricarica'
     AND m.data_movimento < CURRENT_DATE - 180
     AND s.email IN ($ELENCO_SOCI)
  ON CONFLICT (tipo, riferimento_id) DO NOTHING;

  INSERT INTO documento_emesso_voce (tipo, riferimento_id, emessa_il)
  SELECT 'tesseramento', t.id, t.data_rinnovo + INTERVAL '3 days'
    FROM tesseramento t
    JOIN socio s ON s.id = t.socio_id
   WHERE t.data_rinnovo < CURRENT_DATE - 300
     AND s.email IN ($ELENCO_SOCI)
  ON CONFLICT (tipo, riferimento_id) DO NOTHING;

  INSERT INTO documento_emesso_voce (tipo, riferimento_id, emessa_il)
  SELECT 'incontro', i.id, i.data_incontro + INTERVAL '3 days'
    FROM incontro i
    JOIN socio s ON s.id = i.socio_id
   WHERE i.data_incontro < CURRENT_DATE - 100
     AND s.email IN ($ELENCO_SOCI)
     AND NOT EXISTS (SELECT 1 FROM movimento_voucher m WHERE m.incontro_id = i.id)
  ON CONFLICT (tipo, riferimento_id) DO NOTHING;"
echo "  Fatto."

# ------------------------------------------------------------
# Una ricevuta VERA, con il suo PDF.
#
# Le righe scritte sopra sono lo storico di prima che l'applicazione producesse
# documenti: hanno documento_id a NULL e nell'interfaccia non mostrano l'icona.
# Senza almeno una ricevuta completa, la colonna aggiunta ai movimenti del socio
# resterebbe vuota in ogni demo, e nessuno vedrebbe mai la funzionalità.
#
# Il PDF lo genera lo STESSO codice dell'applicazione (service/documenti/pdf.js),
# non un file incollato qui: un modello incollato si sarebbe disallineato al
# primo cambio di layout. Serve perciò il backend compilato; se manca, si salta
# con un avviso invece di fallire.
echo "▶ Emetto una ricevuta dimostrativa..."

# Intestazione e pie' di pagina si SCRIVONO nelle impostazioni e poi si
# RILEGGONO da li'. Il giro sembra inutile ed e' il punto: la ricevuta
# dimostrativa deve uscire con gli stessi identici testi che l'applicazione
# userebbe, non con una copia che vive solo in questo script. Se un domani
# qualcuno cambia i testi da Impostazioni e rilancia il seed, la ricevuta segue.
INTESTAZIONE_DEMO='ASD CLUB TEST
Via Maggiore 1, 26100 Milano - C.F. 05117853655
Iscritta al Registro Nazionale delle Attivita Sportive Dilettantistiche'
PIE_DEMO='Operazione esente da imposta di bollo ai sensi dell articolo 5 della Tabella allegato B al DPR 642/1972.'
psql_exec "
  INSERT INTO impostazione (chiave, valore) VALUES
    ('ricevuta_intestazione', '$INTESTAZIONE_DEMO'),
    ('ricevuta_pie_pagina', '$PIE_DEMO')
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore, updated_at = NOW();"

INTESTAZIONE_DEMO=$(psql_righe "SELECT valore FROM impostazione WHERE chiave = 'ricevuta_intestazione';")
PIE_DEMO=$(psql_righe "SELECT valore FROM impostazione WHERE chiave = 'ricevuta_pie_pagina';")

PDF_JS="$SCRIPT_DIR/../backend/dist/service/documenti/pdf.js"

# Node serve solo a questo passo. In WSL non c'e', ma l'interoperabilita' con
# Windows rende disponibile node.exe: in quel caso i percorsi vanno tradotti
# con wslpath, perche' node.exe non capisce /mnt/c/... Le variabili d'ambiente
# invece NON attraversano il confine WSL->Windows, ed e' il motivo per cui piu
# sotto i dati passano da stdin come JSON e non da env.
NODE_CMD=""
PDF_JS_NODE="$PDF_JS"
BRANDING_NODE="$BRANDING_DIR"
if command -v node > /dev/null 2>&1; then
  NODE_CMD="node"
elif command -v node.exe > /dev/null 2>&1 && command -v wslpath > /dev/null 2>&1; then
  NODE_CMD="node.exe"
  PDF_JS_NODE=$(wslpath -w "$PDF_JS" 2>/dev/null || echo "$PDF_JS")
  BRANDING_NODE=$(wslpath -w "$BRANDING_DIR" 2>/dev/null || echo "$BRANDING_DIR")
fi

if [ ! -f "$BRANDING_DIR/$LOGO_FILE" ]; then
  echo "  Avviso: logo $LOGO_FILE non trovato in $BRANDING_DIR — la ricevuta uscira' senza."
fi

if [ -z "$NODE_CMD" ]; then
  echo "  Saltata: node non e' disponibile in questa shell (ne' node.exe via WSL)."
elif [ ! -f "$PDF_JS" ]; then
  echo "  Saltata: backend non compilato (npm run build --prefix backend)."
else
  # Emette una ricevuta VERA su una voce: numero dal contatore, PDF prodotto dal
  # codice dell'applicazione, riga in "documento" e aggancio della voce.
  # Parametri: tipo della voce, suo id, socio, data della voce, importo,
  # descrizione della riga di dettaglio, causale.
  # ATTENZIONE: descrizione e causale finiscono in letterali SQL fra apici
  # singoli, quindi non devono contenere apostrofi.
  emetti_ricevuta() {
    local tipo="$1" riferimento="$2" socio_id="$3" data_voce="$4" importo="$5" \
          descrizione="$6" causale="$7"
    local intestatario anno oggi numero pdf_b64 doc_id

    intestatario=$(psql_scalar "SELECT nome || ' ' || cognome FROM socio WHERE id = '$socio_id';")
    anno=$(date +%Y)
    oggi=$(date +%F)
    # psql_scalar e non psql_righe: su un INSERT ... RETURNING psql stampa
    # anche il tag del comando ("INSERT 0 1") su una riga a parte, e prendere
    # tutto l output infilerebbe quel testo dentro la query successiva.
    numero=$(psql_scalar "
      INSERT INTO documento_numerazione (anno, ultimo) VALUES ($anno, 1)
      ON CONFLICT (anno) DO UPDATE SET ultimo = documento_numerazione.ultimo + 1, updated_at = NOW()
      RETURNING ultimo;")

    # Stessi testi riletti dalle impostazioni e stesso logo che l'applicazione
    # userebbe: la ricevuta dimostrativa deve essere indistinguibile da una
    # emessa dall'interfaccia.
    #
    # I dati passano da stdin come JSON, non da variabili d'ambiente: con
    # node.exe invocato da WSL l'ambiente non attraversa il confine, e
    # l'intestazione multiriga su una riga di comando sarebbe comunque fragile.
    # jq costruisce il JSON perche' un apostrofo nell'intestazione romperebbe
    # qualunque composizione a mano.
    pdf_b64=$(jq -n \
        --arg pdfJs "$PDF_JS_NODE" --arg brandingDir "$BRANDING_NODE" --arg logoFile "$LOGO_FILE" \
        --arg numero "$numero" --arg anno "$anno" --arg oggi "$oggi" \
        --arg intestatario "$intestatario" --arg dataVoce "$data_voce" --arg importo "$importo" \
        --arg descrizione "$descrizione" --arg causale "$causale" \
        --arg intestazione "$INTESTAZIONE_DEMO" --arg pie "$PIE_DEMO" \
        '$ARGS.named' | "$NODE_CMD" --input-type=module -e '
      import { readFileSync } from "node:fs";
      import { pathToFileURL } from "node:url";

      const d = JSON.parse(readFileSync(0, "utf8"));
      const url = pathToFileURL(d.pdfJs).href;

      // percorsoLogo() legge LOGO_FILE e BRANDING_DIR dall ambiente: qui si
      // impostano PRIMA dell import, cosi la risoluzione del logo (compreso il
      // gemello raster di un SVG) resta quella vera dell applicazione, invece
      // di essere riscritta a mano in questo script.
      process.env.LOGO_FILE = d.logoFile;
      process.env.BRANDING_DIR = d.brandingDir;

      const { generaDocumentoPdf } = await import(url);
      const { importoInLettere } = await import(url.replace("pdf.js", "lettere.js"));
      const { percorsoLogo } = await import(url.replace("pdf.js", "logo.js"));

      const importo = Number(d.importo);
      const pdf = await generaDocumentoPdf({
        numero: Number(d.numero), anno: Number(d.anno),
        data: d.oggi,
        intestatario: d.intestatario,
        causale: d.causale,
        importo, importoLettere: importoInLettere(importo),
        righe: [{ data: d.dataVoce, descrizione: d.descrizione, importo }],
        intestazione: d.intestazione,
        piePagina: d.pie,
        logo: percorsoLogo(),
      });
      process.stdout.write(pdf.toString("base64"));
    ' | tr -d '\r')

    doc_id=$(psql_scalar "
      INSERT INTO documento (anno, numero, data_documento, socio_id, intestatario, causale,
                             importo, importo_lettere, nome_file, contenuto)
      VALUES ($anno, $numero, CURRENT_DATE, '$socio_id', '$intestatario',
              '$causale', $importo, 'dimostrativa',
              'ricevuta_${anno}_${numero}.pdf', decode('$pdf_b64', 'base64'))
      RETURNING id;")

    psql_exec "
      INSERT INTO documento_emesso_voce (tipo, riferimento_id, documento_id)
      VALUES ('$tipo', '$riferimento', '$doc_id')
      ON CONFLICT (tipo, riferimento_id) DO NOTHING;"
    echo "  Ricevuta n. $numero/$anno a $intestatario — $causale."
  }

  # 1. Su una RICARICA: è la ricevuta che il socio ritrova fra i movimenti del
  #    proprio voucher.
  RICARICA=$(psql_righe "
    SELECT m.id || '|' || m.data_movimento || '|' || COALESCE(m.importo_pagato, m.importo) || '|' || s.id
      FROM movimento_voucher m
      JOIN voucher v ON v.id = m.voucher_id
      JOIN socio s ON s.id = v.socio_id
     WHERE m.tipo = 'ricarica'
       AND s.email IN ($ELENCO_SOCI)
       AND NOT EXISTS (SELECT 1 FROM documento_emesso_voce d
                        WHERE d.tipo = 'ricarica' AND d.riferimento_id = m.id)
     ORDER BY m.data_movimento DESC
     LIMIT 1;" | tr -d ' ' | head -1)

  if [ -z "$RICARICA" ]; then
    echo "  Saltata la ricevuta su ricarica: nessuna ricarica libera."
  else
    emetti_ricevuta 'ricarica' \
      "$(echo "$RICARICA" | cut -d'|' -f1)" "$(echo "$RICARICA" | cut -d'|' -f4)" \
      "$(echo "$RICARICA" | cut -d'|' -f2)" "$(echo "$RICARICA" | cut -d'|' -f3)" \
      'Ricarica voucher' 'ricarica voucher (dati dimostrativi)'
  fi

  # 2. Su un INCONTRO di chi NON ha un voucher (Vitali): è l'unico modo in cui
  #    quel socio raggiunge una propria ricevuta, perché non ha movimenti da cui
  #    partire (spec 004). Senza questa, la colonna nella sua pagina Incontri
  #    resterebbe vuota in ogni demo e la funzione non si vedrebbe.
  INCONTRO=$(psql_righe "
    SELECT i.id || '|' || i.data_incontro || '|' || i.costo || '|' || s.id || '|' || a.nome
      FROM incontro i
      JOIN socio s ON s.id = i.socio_id
      JOIN attivita a ON a.id = i.attivita_id
     WHERE s.email = '$EMAIL_SOCIO4'
       AND NOT EXISTS (SELECT 1 FROM movimento_voucher m WHERE m.incontro_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM documento_emesso_voce d
                        WHERE d.tipo = 'incontro' AND d.riferimento_id = i.id)
     ORDER BY i.data_incontro DESC
     LIMIT 1;" | head -1)

  if [ -z "$INCONTRO" ]; then
    echo "  Saltata la ricevuta su incontro: nessun incontro libero."
  else
    emetti_ricevuta 'incontro' \
      "$(echo "$INCONTRO" | cut -d'|' -f1 | tr -d ' ')" "$(echo "$INCONTRO" | cut -d'|' -f4 | tr -d ' ')" \
      "$(echo "$INCONTRO" | cut -d'|' -f2 | tr -d ' ')" "$(echo "$INCONTRO" | cut -d'|' -f3 | tr -d ' ')" \
      "Incontro: $(echo "$INCONTRO" | cut -d'|' -f5 | sed 's/^ *//;s/ *$//')" \
      'incontro pagato a parte (dati dimostrativi)'
  fi
fi

# ------------------------------------------------------------
# Riepilogo, letto dal database e non scritto a mano
# ------------------------------------------------------------
echo ""
echo "=== Fatto ==="
echo ""
echo "Account:"
# printf e non echo: le email hanno lunghezze diverse, e allineare le colonne a
# mano con gli spazi si disallinea al primo cambio di nome.
printf "  %-26s %-21s password: %s\n" "$EMAIL_ADMIN"  "ADMIN (senza socio)" "quella di INITIAL_ADMIN_PASSWORD"
printf "  %-26s %-21s password: %s\n" "$EMAIL_ISTR1"  "istruttore"          "$DEMO_PASSWORD"
printf "  %-26s %-21s password: %s\n" "$EMAIL_ISTR2"  "istruttore"          "$DEMO_PASSWORD"
printf "  %-26s %-21s password: %s\n" "$EMAIL_SOCIO1" "socio"               "$DEMO_PASSWORD"
printf "  %-26s %-21s password: %s\n" "$EMAIL_SOCIO2" "socio"               "$DEMO_PASSWORD"
printf "  %-26s %-21s password: %s\n" "$EMAIL_SOCIO3" "socio"               "$DEMO_PASSWORD"
printf "  %-26s %-21s password: %s\n" "$EMAIL_SOCIO4" "socio, senza voucher" "$DEMO_PASSWORD"
echo ""
printf "  %-26s %s\n" "$EMAIL_GESTIONALE" "scheda socio SENZA account (da collegare dalle Impostazioni)"
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
echo "Movimenti e voci documentabili per socio:"
psql_righe "
  SELECT '  ' || s.cognome || ' ' || s.nome,
         COALESCE(COUNT(m.id), 0) || ' movimenti'
  FROM socio s
  LEFT JOIN voucher v ON v.socio_id = s.id
  LEFT JOIN movimento_voucher m ON m.voucher_id = v.id
  WHERE s.email IN ($ELENCO_SOCI)
  GROUP BY s.cognome, s.nome
  ORDER BY 1;"
echo ""
echo "Incontri per istruttore (da rendicontare / totali):"
psql_righe "
  SELECT '  ' || COALESCE(NULLIF(s.cognome || ' ' || s.nome, ' '), i.istruttore_id),
         COUNT(*) FILTER (WHERE i.rendicontato_il IS NULL) || ' / ' || COUNT(*)
  FROM incontro i
  LEFT JOIN socio s ON s.id_viewer = i.istruttore_id
  WHERE i.socio_id IN (SELECT id FROM socio WHERE email IN ($ELENCO_SOCI))
    AND i.istruttore_id IS NOT NULL
  GROUP BY 1
  ORDER BY 1;"
echo ""
echo "Voci gia documentate, per tipo:"
psql_righe "
  SELECT '  ' || tipo, COUNT(*) FROM documento_emesso_voce GROUP BY tipo ORDER BY 1;"
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

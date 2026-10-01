# Creazione delle entita del dominio: account, soci, voucher, incontri
#
# Parte di scripts/seed-demo-data.sh, che lo carica con "source": non si
# esegue da solo e non ha shebang di proposito.


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

# Variabili d'ambiente, credenziali e anagrafica dei dati di esempio
#
# Parte di scripts/seed-demo-data.sh, che lo carica con "source": non si
# esegue da solo e non ha shebang di proposito.

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

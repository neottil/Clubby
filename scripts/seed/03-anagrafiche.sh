# Listino, account, schede socio e abilitazioni
#
# Parte di scripts/seed-demo-data.sh, che lo carica con "source": non si
# esegue da solo e non ha shebang di proposito.

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

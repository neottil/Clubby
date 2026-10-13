# Quota di tesseramento e rinnovi
#
# Parte di scripts/seed-demo-data.sh, che lo carica con "source": non si
# esegue da solo e non ha shebang di proposito.

# ------------------------------------------------------------
# 8. Tesseramenti
# ------------------------------------------------------------
echo "▶ Imposto la quota e registro i tesseramenti..."
psql_exec "
  INSERT INTO impostazione (chiave, valore) VALUES ('quota_tesseramento', '20.00')
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore, updated_at = NOW();"

# Bianchi: attivo, scade fra 65 giorni
crea_tesseramento "$SOCIO_ISTR1" 300 -65 20.00 CL-0001
# Ferrari: in scadenza fra 20 giorni
crea_tesseramento "$SOCIO_ISTR2" 345 -20 20.00 CL-0002
# Moretti: scaduto da 35 giorni, con la quota dell'anno prima — resta piu bassa
# dell'attuale, cosi lo storico mostra un importo diverso da quello in vigore.
crea_tesseramento "$SOCIO_1" 400 35 15.00 CL-0003
# Rinaldi: due rinnovi; l'ultimo scade fra 5 giorni. Il primo e senza numero,
# come un rinnovo registrato prima che il numero si chiedesse.
crea_tesseramento "$SOCIO_2" 730 365 15.00
crea_tesseramento "$SOCIO_2" 360 -5 20.00 CL-0004
# Costa: attivo, scade fra 100 giorni
crea_tesseramento "$SOCIO_3" 265 -100 20.00 CL-0005
# Vitali: mai tesserata
echo "  6 rinnovi registrati."

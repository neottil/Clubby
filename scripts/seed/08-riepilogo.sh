# Riepilogo finale, letto dal database
#
# Parte di scripts/seed-demo-data.sh, che lo carica con "source": non si
# esegue da solo e non ha shebang di proposito.

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

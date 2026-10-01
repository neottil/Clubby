# Cio che risulta gia rendicontato o gia documentato
#
# Parte di scripts/seed-demo-data.sh, che lo carica con "source": non si
# esegue da solo e non ha shebang di proposito.

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

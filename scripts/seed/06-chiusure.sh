# Cio che risulta gia rendicontato
#
# Parte di scripts/seed-demo-data.sh, che lo carica con "source": non si
# esegue da solo e non ha shebang di proposito.

# ------------------------------------------------------------
# 9. Rendicontazione
# ------------------------------------------------------------
# Senza qualche riga gia chiusa, la funzionalita si vede solo a meta:
# l'interruttore "mostra anche i gia rendicontati" non avrebbe niente da
# mostrare, e la casella spuntata e bloccata non comparirebbe mai.
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

# Le voci gia documentate NON si scrivono qui. Una voce segnata come emessa
# senza la sua ricevuta e' uno stato che l'applicazione non produce: la riga in
# documento_emesso_voce nasce solo insieme al documento, nella stessa
# transazione. Gli esempi di voci gia documentate li crea 07, con ricevute vere.
echo "  Fatto."

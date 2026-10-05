# Le tre ricevute vere, con il PDF prodotto dal codice dell'applicazione
#
# Parte di scripts/seed-demo-data.sh, che lo carica con "source": non si
# esegue da solo e non ha shebang di proposito.

# ------------------------------------------------------------
# Ricevute VERE, con il loro PDF: una per ciascun tipo di voce (ricarica,
# incontro, tesseramento).
#
# Sono anche gli unici esempi di voci gia documentate. Il seed non segna voci
# come emesse senza una ricevuta: l'applicazione non lo fa mai (la riga in
# documento_emesso_voce nasce insieme al documento), e una voce bloccata senza
# il suo PDF sembrerebbe un errore a chi prova la pagina Ricevute. Senza queste,
# la colonna Ricevuta resterebbe vuota in ogni demo, e nessuno vedrebbe mai la
# funzionalità.
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

  # 3. Su un TESSERAMENTO: il socio la ritrova nello storico dei rinnovi della
  #    pagina Tesseramenti, la terza strada verso le proprie ricevute (spec 004).
  #    Il più vecchio, così il rinnovo documentato sta nello storico e non è
  #    quello in corso.
  TESSERAMENTO=$(psql_righe "
    SELECT t.id || '|' || t.data_rinnovo || '|' || t.importo || '|' || s.id || '|' || to_char(t.scadenza, 'DD/MM/YYYY')
      FROM tesseramento t
      JOIN socio s ON s.id = t.socio_id
     WHERE s.email IN ($ELENCO_SOCI)
       AND NOT EXISTS (SELECT 1 FROM documento_emesso_voce d
                        WHERE d.tipo = 'tesseramento' AND d.riferimento_id = t.id)
     ORDER BY t.data_rinnovo
     LIMIT 1;" | tr -d ' ' | head -1)

  if [ -z "$TESSERAMENTO" ]; then
    echo "  Saltata la ricevuta su tesseramento: nessun rinnovo libero."
  else
    emetti_ricevuta 'tesseramento'       "$(echo "$TESSERAMENTO" | cut -d'|' -f1)" "$(echo "$TESSERAMENTO" | cut -d'|' -f4)"       "$(echo "$TESSERAMENTO" | cut -d'|' -f2)" "$(echo "$TESSERAMENTO" | cut -d'|' -f3)"       "Tesseramento fino al $(echo "$TESSERAMENTO" | cut -d'|' -f5)"       'quota di tesseramento (dati dimostrativi)'
  fi
fi

-- 003 — Ricevute PDF (spec 003)
--
-- Solo aggiunte, come impone la regola delle migrazioni: il database può
-- stare avanti all'applicazione, mai indietro.

-- ============================================================
-- Numerazione progressiva per anno
-- ============================================================
-- Una riga per anno, creata al primo documento di quell'anno.
--
-- NON è una SEQUENCE di proposito: nextval() non fa rollback, quindi una
-- transazione fallita brucerebbe il numero e lascerebbe un buco nella
-- numerazione — esattamente ciò che una numerazione di ricevute non può
-- permettersi. Con una riga, il numero preso da una transazione annullata
-- torna disponibile.
CREATE TABLE IF NOT EXISTS documento_numerazione (
  anno       INTEGER PRIMARY KEY,
  ultimo     INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Documenti emessi
-- ============================================================
-- Il PDF sta qui dentro, in BYTEA: cinquecento documenti in cinque anni fanno
-- una decina di MB, entrano nel pg_dump che già esiste e si ripristinano
-- insieme alla riga che li referenzia. Un object storage separato
-- introdurrebbe un secondo sistema da salvare e tenere coerente con questo.
CREATE TABLE IF NOT EXISTS documento (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anno            INTEGER NOT NULL,
  numero          INTEGER NOT NULL,
  data_documento  DATE NOT NULL,
  socio_id        UUID NOT NULL REFERENCES socio(id),
  -- Denormalizzati apposta: il documento deve restare leggibile com'era il
  -- giorno in cui è stato consegnato, anche se il socio cambia cognome o
  -- l'intestazione dell'associazione cambia indirizzo.
  intestatario    TEXT NOT NULL,
  causale         TEXT NOT NULL,
  importo         NUMERIC(10,2) NOT NULL,
  importo_lettere TEXT NOT NULL,
  nome_file       TEXT NOT NULL,
  contenuto       BYTEA NOT NULL,
  -- `sub` dell'admin che ha confermato: serve a rispondere a "chi l'ha emessa".
  emesso_da       VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_documento_anno_numero UNIQUE (anno, numero)
);

CREATE INDEX IF NOT EXISTS idx_documento_socio
  ON documento(socio_id, data_documento DESC);

-- ============================================================
-- Aggancio con le voci già documentate
-- ============================================================
-- documento_emesso_voce.documento_id esiste dalla 002, nullable, proprio in
-- attesa di questa tabella. Le righe storiche restano a NULL e il vincolo le
-- accetta: sono le voci marcate come emesse quando il documento non veniva
-- ancora prodotto.
--
-- Postgres non ha "ADD CONSTRAINT IF NOT EXISTS": la guardia la mette il DO,
-- come già fa schema.sql per i trigger.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_documento_emesso_voce_documento'
  ) THEN
    ALTER TABLE documento_emesso_voce
      ADD CONSTRAINT fk_documento_emesso_voce_documento
      FOREIGN KEY (documento_id) REFERENCES documento(id);
  END IF;
END $$;

-- Le voci di un documento si leggono per documento_id ogni volta che si apre
-- una ricevuta; senza indice sarebbe una scansione dell'intera tabella.
CREATE INDEX IF NOT EXISTS idx_documento_emesso_voce_documento
  ON documento_emesso_voce(documento_id);

-- ============================================================
-- Intestazione e piè di pagina delle ricevute
-- ============================================================
-- Testo libero multiriga. Stanno in `impostazione` (chiave/valore) e non in
-- colonne dedicate perché cambiano senza un rilascio: l'admin li modifica
-- dalla pagina Impostazioni. Il logo invece NON sta qui — arriva
-- dall'immagine, da branding/, scelto per ambiente da LOGO_FILE.
INSERT INTO impostazione (chiave, valore) VALUES ('ricevuta_intestazione', '')
  ON CONFLICT (chiave) DO NOTHING;
INSERT INTO impostazione (chiave, valore) VALUES ('ricevuta_pie_pagina', '')
  ON CONFLICT (chiave) DO NOTHING;

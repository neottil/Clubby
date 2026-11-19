-- 005 — Ricevute libere (spec 013)
--
-- Due modifiche che non sono aggiunte pure, dichiarate nella spec: un NOT NULL
-- che si rilassa e un CHECK che si allarga. Entrambe lasciano funzionare la
-- release precedente, che scrive sempre socio_id e non conosce il tipo
-- 'libera': il database può stare avanti all'applicazione, mai indietro.

-- ============================================================
-- Una ricevuta libera non ha un socio
-- ============================================================
-- Il backend precedente legge i documenti con JOIN su socio: una ricevuta
-- senza socio, per lui, non esiste. Non ne scrive, quindi non ne vedrà finché
-- non arriva il codice che le emette.
ALTER TABLE documento ALTER COLUMN socio_id DROP NOT NULL;

-- ============================================================
-- Righe di una ricevuta libera
-- ============================================================
-- Una quarta fonte di voci, accanto a movimenti, tesseramenti e incontri. Non
-- ha documento_id: il legame con la ricevuta passa da documento_emesso_voce
-- con tipo 'libera', lo stesso percorso delle altre tre, e tenerlo anche qui
-- vorrebbe dire la stessa informazione in due posti.
--
-- Che ogni riga abbia il suo legame lo garantisce l'emissione, che scrive
-- documento, righe e legami nella stessa transazione: riferimento_id è
-- polimorfico, e una foreign key non può puntare a quattro tabelle.
CREATE TABLE IF NOT EXISTS ricevuta_voce_libera (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Ordine in cui l'admin le ha scritte, ripetuto nel PDF.
  posizione   INTEGER NOT NULL CHECK (posizione > 0),
  data        DATE NOT NULL,
  descrizione TEXT NOT NULL,
  importo     NUMERIC(10,2) NOT NULL CHECK (importo > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Il quarto tipo di voce
-- ============================================================
-- Il CHECK della 002 è anonimo, e il nome che Postgres gli ha dato non è un
-- contratto: lo si cerca per tabella e colonna, si toglie, e lo si sostituisce
-- con uno con nome. La guardia rende il blocco rieseguibile.
DO $$
DECLARE
  vecchio TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_documento_emesso_voce_tipo'
  ) THEN
    FOR vecchio IN
      SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       WHERE c.conrelid = 'documento_emesso_voce'::regclass
         AND c.contype = 'c'
         AND a.attname = 'tipo'
    LOOP
      EXECUTE format('ALTER TABLE documento_emesso_voce DROP CONSTRAINT %I', vecchio);
    END LOOP;

    ALTER TABLE documento_emesso_voce
      ADD CONSTRAINT ck_documento_emesso_voce_tipo
      CHECK (tipo IN ('ricarica', 'tesseramento', 'incontro', 'libera'));
  END IF;
END $$;

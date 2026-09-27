-- Ricariche con valore extra (RECHARGE_MODE = percentage | map)
--
-- Il socio può ricevere sul voucher più di quanto paga. Da qui in avanti
-- "quanto paga" e "quanto gli viene accreditato" sono due cose distinte:
--   - il voucher si muove per il VALORE accreditato (colonna importo);
--   - la Fatturazione conta l'importo PAGATO, l'unico incassato davvero.
-- Contare il valore accreditato in fattura significherebbe fatturare denaro
-- mai ricevuto.
--
-- Additiva e retrocompatibile: la colonna nasce NULL e il codice in esecuzione
-- prima di questo deploy non la conosce. NULL vale "pagato quanto accreditato",
-- che è com'erano tutte le ricariche fino a qui — nessun backfill necessario.

-- ------------------------------------------------------------------
-- movimento_voucher: quanto è stato effettivamente pagato
-- ------------------------------------------------------------------
ALTER TABLE movimento_voucher
  ADD COLUMN IF NOT EXISTS importo_pagato DECIMAL(10,2);

COMMENT ON COLUMN movimento_voucher.importo_pagato IS
  'Solo per le ricariche: quanto ha pagato il socio, se diverso da importo (che è il valore accreditato sul voucher). NULL = ha pagato esattamente importo. La Fatturazione usa COALESCE(importo_pagato, importo).';

-- Un addebito non ha un "pagato", e un pagato non può essere <= 0. Il vincolo
-- è aggiunto solo se non c'è già: rieseguire la migrazione non deve fallire
-- sul nome duplicato.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'movimento_pagato_coerente'
  ) THEN
    ALTER TABLE movimento_voucher
      ADD CONSTRAINT movimento_pagato_coerente CHECK (
        importo_pagato IS NULL
        OR (tipo = 'ricarica' AND importo_pagato > 0)
      );
  END IF;
END
$$;

-- ------------------------------------------------------------------
-- ricarica_taglio: i tagli preconfigurati (RECHARGE_MODE = map)
-- ------------------------------------------------------------------
-- Una riga per taglio: "pagando importo, il voucher riceve valore".
-- L'elenco è configurato dall'admin e mostrato in una select al momento della
-- ricarica; il backend ricava sempre il valore da qui, non dal client.
CREATE TABLE IF NOT EXISTS ricarica_taglio (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importo     DECIMAL(10,2) NOT NULL CHECK (importo > 0),
  valore      DECIMAL(10,2) NOT NULL CHECK (valore > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un solo taglio per importo: due righe con lo stesso importo renderebbero
-- ambigua la select e la ricerca del valore corrispondente.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ricarica_taglio_importo ON ricarica_taglio(importo);

-- ------------------------------------------------------------------
-- percentuale_ricarica (RECHARGE_MODE = percentage)
-- ------------------------------------------------------------------
-- Percentuale di valore aggiunto a una ricarica di importo libero. Sta fra le
-- impostazioni e non in una tabella propria: è un singolo numero configurato
-- dall'admin, come la quota di tesseramento.
INSERT INTO impostazione (chiave, valore) VALUES ('percentuale_ricarica', '0')
  ON CONFLICT (chiave) DO NOTHING;

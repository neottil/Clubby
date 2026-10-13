-- 004 — Numero di tessera (spec 007)
--
-- Solo aggiunte, come impone la regola delle migrazioni: il database può
-- stare avanti all'applicazione, mai indietro.

-- Il numero sta sul rinnovo e non sul socio: la tessera è dell'anno, e lo
-- storico deve dire quale numero aveva il socio in quell'anno.
--
-- Nullable di proposito: i tesseramenti registrati prima di questa colonna non
-- hanno un numero, e NOT NULL obbligherebbe a inventarlo. L'obbligo sui
-- tesseramenti nuovi lo applica il backend.
ALTER TABLE tesseramento ADD COLUMN IF NOT EXISTS numero_tessera VARCHAR(30);

-- "Un numero, un solo socio" lo controlla il service, non un indice unico:
-- lo stesso numero sullo stesso socio in due rinnovi è il caso normale. Questo
-- indice serve a quel controllo e alla ricerca per numero nell'elenco soci.
CREATE INDEX IF NOT EXISTS idx_tesseramento_numero ON tesseramento(numero_tessera);

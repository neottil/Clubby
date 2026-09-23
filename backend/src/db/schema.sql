-- ============================================================
-- Clubby - Schema SQL (PostgreSQL 16)
-- ============================================================
-- Montato automaticamente da docker-compose in
-- /docker-entrypoint-initdb.d/01-schema.sql
-- È idempotente: può essere ri-eseguito senza danni.
-- ============================================================

-- Estensione per UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- Convenzione sui tipi temporali
-- ------------------------------------------------------------
-- DATE          → date di calendario inserite da un utente (iscrizione,
--                 incontro, movimento). Non sono istanti: un incontro è "il 28
--                 luglio" ovunque lo si guardi, e convertirlo in un istante lo
--                 farebbe scivolare al giorno prima o dopo a seconda del fuso.
-- TIMESTAMPTZ   → istanti generati dal sistema (created_at/updated_at, usati
--                 per audit e per ordinare a parità di data). Qui il fuso c'è
--                 davvero ed è quello del momento della scrittura.
-- TIMESTAMP     → da evitare: non ha fuso ma il driver pg lo converte come se
--                 ne avesse (vedi il type parser in db/client.ts).
-- ------------------------------------------------------------

-- ============================================================
-- Tabella: socio
-- ============================================================
CREATE TABLE IF NOT EXISTS socio (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            VARCHAR(100) NOT NULL,
  cognome         VARCHAR(100) NOT NULL,
  email           VARCHAR(255),
  telefono        VARCHAR(50),
  data_iscrizione DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Id dell'account nell'authorizer (il claim `sub` dei suoi token): è il
  -- collegamento fra un account e il socio di cui può vedere i dati. NULL per
  -- i soci "solo gestionale", registrati dall'admin senza un account proprio.
  id_viewer       VARCHAR(255) NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_socio_email    ON socio(email);
CREATE INDEX IF NOT EXISTS idx_socio_viewer   ON socio(id_viewer);
-- listSoci() (soci.service.ts) ordina sempre per cognome, nome: senza questo
-- indice Postgres fa un sort separato dopo lo scan della tabella.
CREATE INDEX IF NOT EXISTS idx_socio_cognome_nome ON socio(cognome, nome);

-- ============================================================
-- Tabella: attivita
-- ============================================================
-- Listino delle attività proponibili in un incontro, con il costo che viene
-- proposto quando la si sceglie. Il costo è unico per attività (non varia per
-- istruttore): l'incontro conserva comunque il proprio `costo`, perché il
-- listino può cambiare nel tempo e gli incontri già registrati devono
-- continuare a valere quello che valevano allora.
CREATE TABLE IF NOT EXISTS attivita (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            VARCHAR(100) NOT NULL UNIQUE,
  costo_default   DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (costo_default >= 0),
  -- Un'attività non più proposta non può essere cancellata se ha incontri
  -- collegati (la FK lo impedisce): si disattiva, sparisce dalle select e
  -- resta leggibile sullo storico.
  attiva          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attivita_nome ON attivita(nome);

-- ============================================================
-- Tabella: istruttore_attivita
-- ============================================================
-- Quali attività ogni istruttore è abilitato a svolgere. Senza una riga qui
-- un istruttore non può registrare incontri di quell'attività (il controllo è
-- in incontri.service.ts, non solo nell'interfaccia).
--
-- istruttore_id è l'id dell'account nell'authorizer (il claim `sub` dei suoi
-- token), non una FK: gli account vivono in un database separato. Stessa
-- convenzione di socio.id_viewer.
CREATE TABLE IF NOT EXISTS istruttore_attivita (
  istruttore_id   VARCHAR(255) NOT NULL,
  attivita_id     UUID NOT NULL REFERENCES attivita(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (istruttore_id, attivita_id)
);

-- ============================================================
-- Tabella: incontro
-- ============================================================
CREATE TABLE IF NOT EXISTS incontro (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id        UUID NOT NULL REFERENCES socio(id) ON DELETE CASCADE,
  data_incontro   DATE NOT NULL,
  -- Obbligatoria: identifica l'incontro nelle liste e finisce nella
  -- descrizione del movimento di addebito che ne deriva
  -- ("Incontro: {attivita}", vedi incontri.service.ts). Un incontro senza
  -- attività produceva una riga di movimento indistinguibile dalle altre.
  -- Nessun ON DELETE: un'attività ancora usata da un incontro non deve poter
  -- sparire, altrimenti lo storico perderebbe il proprio significato.
  attivita_id     UUID NOT NULL REFERENCES attivita(id),
  -- Account dell'istruttore che ha tenuto l'incontro (claim `sub`). Nullable:
  -- l'admin può registrare un incontro senza attribuirlo a nessuno.
  -- Come istruttore_attivita.istruttore_id non è una FK: gli account stanno
  -- nel database dell'authorizer.
  istruttore_id   VARCHAR(255),
  costo           DECIMAL(10,2) NOT NULL CHECK (costo >= 0),
  note            TEXT,
  -- Formato di "note": false = testo semplice, true = Markdown. Serve al
  -- frontend per sapere come renderizzare la nota nella modale di lettura,
  -- senza doverlo indovinare dal contenuto (un testo semplice che contiene
  -- "*" o "#" verrebbe altrimenti interpretato come sintassi Markdown).
  note_markdown   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Il resoconto e l'elenco filtrato per istruttore partono da questa colonna;
-- l'indice è parziale perché gli incontri senza istruttore non vengono mai
-- cercati per questa via.
CREATE INDEX IF NOT EXISTS idx_incontro_istruttore ON incontro(istruttore_id, data_incontro DESC)
  WHERE istruttore_id IS NOT NULL;
-- Serve al filtro per attività dell'elenco incontri e al controllo di
-- integrità che precede la cancellazione di una voce di listino.
CREATE INDEX IF NOT EXISTS idx_incontro_attivita ON incontro(attivita_id);

-- idx_incontro_data resta: serve alla lista globale (listIncontri() senza
-- filtro socio, incontri.service.ts) ordinata per data su tutti i soci.
CREATE INDEX IF NOT EXISTS idx_incontro_data       ON incontro(data_incontro);
-- listIncontri(socioId) filtra per socio_id E ordina per data_incontro DESC:
-- questo indice evita il sort separato dopo il filtro, e il suo prefisso copre
-- già "WHERE socio_id = ..." da solo.
-- created_at in coda: data_incontro è una DATE, quindi più incontri dello
-- stesso socio nello stesso giorno hanno bisogno di uno spareggio stabile.
CREATE INDEX IF NOT EXISTS idx_incontro_socio_data_creato ON incontro(socio_id, data_incontro DESC, created_at DESC);

-- ============================================================
-- Tabella: voucher
-- ============================================================
CREATE TABLE IF NOT EXISTS voucher (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id        UUID NOT NULL REFERENCES socio(id) ON DELETE CASCADE,
  data_creazione  DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Credito importato da un voucher già in uso prima di Clubby, per la sola
  -- configurazione iniziale. Non è una ricarica e non viene fatturato: un
  -- voucher nuovo parte da zero e il credito acquistato entra come movimento
  -- di tipo 'ricarica'.
  saldo_iniziale  DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (saldo_iniziale >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voucher_socio ON voucher(socio_id);
-- listVouchers() senza filtro socio (vouchers.service.ts) ordina sempre per
-- data_creazione DESC su tutti i vouchers.
-- created_at in coda per lo stesso motivo di idx_movimento_voucher_data_creato:
-- data_creazione è una DATE, e più vouchers creati lo stesso giorno vanno
-- comunque ordinati in modo stabile.
CREATE INDEX IF NOT EXISTS idx_voucher_data_creato ON voucher(data_creazione DESC, created_at DESC);

-- ============================================================
-- Tabella: movimento_voucher
-- ============================================================
CREATE TABLE IF NOT EXISTS movimento_voucher (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id      UUID NOT NULL REFERENCES voucher(id) ON DELETE CASCADE,
  incontro_id     UUID REFERENCES incontro(id) ON DELETE CASCADE,
  -- DATE e non TIMESTAMP: per un addebito è la data dell'incontro che lo
  -- genera, che è una data di calendario. A parità di giorno l'ordine dei
  -- movimenti è dato da created_at (vedi listMovimenti).
  data_movimento  DATE NOT NULL DEFAULT CURRENT_DATE,
  importo         DECIMAL(10,2) NOT NULL,  -- positivo = credito, negativo = addebito
  -- Natura del movimento, esplicita e non dedotta dal segno dell'importo:
  --   ricarica   credito acquistato dal socio (importo positivo): è ciò che la
  --              Fatturazione conta come voucher venduto
  --   addebito   consumo del credito (importo negativo): l'incontro che lo ha
  --              generato, quando c'è, è in incontro_id
  -- Un addebito su un voucher non viene mai fatturato: è già coperto dalla
  -- ricarica che lo paga. Gli incontri di chi non ha un voucher non passano
  -- da qui, e sono quelli che la Fatturazione conta come addebiti singoli.
  tipo            VARCHAR(20) NOT NULL CHECK (tipo IN ('ricarica', 'addebito')),
  descrizione     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT movimento_tipo_coerente CHECK (
    (incontro_id IS NULL OR tipo = 'addebito')
    AND ((tipo = 'ricarica' AND importo > 0) OR (tipo = 'addebito' AND importo < 0))
  )
);

-- listMovimenti() (vouchers.service.ts) filtra sempre per voucher_id E ordina
-- per data_movimento DESC nella stessa query.
-- created_at in coda: data_movimento è una DATE, due movimenti dello stesso
-- giorno hanno la stessa chiave di ordinamento e Postgres non garantisce un
-- ordine stabile fra loro. listMovimenti ordina quindi per data_movimento DESC,
-- created_at DESC, e l'indice copre entrambe le colonne per evitare un sort.
CREATE INDEX IF NOT EXISTS idx_movimento_voucher_data_creato ON movimento_voucher(voucher_id, data_movimento DESC, created_at DESC);
-- Un incontro genera al più un movimento (creato/aggiornato/rimosso in modo atomico insieme all'incontro)
CREATE UNIQUE INDEX IF NOT EXISTS idx_movimento_incontro_unique ON movimento_voucher(incontro_id) WHERE incontro_id IS NOT NULL;
-- Le ricariche per periodo sono una delle tre fonti della Fatturazione.
CREATE INDEX IF NOT EXISTS idx_movimento_ricarica_data ON movimento_voucher(data_movimento) WHERE tipo = 'ricarica';

-- ============================================================
-- Tabella: tesseramento
-- ============================================================
-- Un rinnovo del tesseramento al club: ogni riga è un rinnovo, e la scadenza
-- corrente di un socio è la più lontana fra le sue. La quota è registrata qui
-- e non sul voucher: si paga a parte, e compare solo in Fatturazione.
CREATE TABLE IF NOT EXISTS tesseramento (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id        UUID NOT NULL REFERENCES socio(id) ON DELETE CASCADE,
  data_rinnovo    DATE NOT NULL DEFAULT CURRENT_DATE,
  scadenza        DATE NOT NULL,
  -- Copiata dalla quota configurata al momento del rinnovo (e correggibile):
  -- cambiare la quota non riscrive i rinnovi già fatti.
  importo         DECIMAL(10,2) NOT NULL CHECK (importo >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tesseramento_scadenza_dopo_rinnovo CHECK (scadenza > data_rinnovo)
);

-- Ultima scadenza per socio (tabella Tesseramenti) e storico dal più recente.
CREATE INDEX IF NOT EXISTS idx_tesseramento_socio_scadenza ON tesseramento(socio_id, scadenza DESC);
-- Filtro per periodo della Fatturazione.
CREATE INDEX IF NOT EXISTS idx_tesseramento_data ON tesseramento(data_rinnovo);

-- ============================================================
-- Tabella: impostazione
-- ============================================================
-- Parametri dell'associazione modificabili dall'admin, uno per riga.
CREATE TABLE IF NOT EXISTS impostazione (
  chiave          VARCHAR(100) PRIMARY KEY,
  valore          TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quota proposta a ogni rinnovo del tesseramento. ON CONFLICT: rieseguire lo
-- schema non deve azzerare un valore già configurato.
INSERT INTO impostazione (chiave, valore) VALUES ('quota_tesseramento', '0.00')
  ON CONFLICT (chiave) DO NOTHING;

-- ============================================================
-- Trigger: aggiorna updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_socio_updated_at') THEN
    CREATE TRIGGER trg_socio_updated_at
      BEFORE UPDATE ON socio
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_attivita_updated_at') THEN
    CREATE TRIGGER trg_attivita_updated_at
      BEFORE UPDATE ON attivita
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_incontro_updated_at') THEN
    CREATE TRIGGER trg_incontro_updated_at
      BEFORE UPDATE ON incontro
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_voucher_updated_at') THEN
    CREATE TRIGGER trg_voucher_updated_at
      BEFORE UPDATE ON voucher
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

-- ============================================================
-- Permessi: assicura che l'utente applicativo abbia accesso
-- (rilevante quando lo schema è creato da un superuser)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clubby') THEN
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO clubby;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO clubby;
  END IF;
END;
$$;

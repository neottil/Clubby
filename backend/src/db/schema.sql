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
  id_viewer       VARCHAR(255) NULL,   -- Keycloak user ID del viewer associato
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
  attivita        VARCHAR(100) NOT NULL,
  -- Nome dell'istruttore che ha tenuto l'incontro, scelto fra quelli
  -- configurati nel frontend (VITE_SELECT_ISTRUTTORI_VALUES). Nullable: le
  -- installazioni con un solo istruttore non configurano la variabile e non
  -- mostrano affatto il campo, e gli incontri registrati prima
  -- dell'introduzione del campo non hanno un valore da attribuire.
  -- Non è una FK: gli istruttori non sono un'entità a db, sono una lista di
  -- configurazione per tenant.
  istruttore      VARCHAR(100),
  costo           DECIMAL(10,2) NOT NULL CHECK (costo >= 0),
  note            TEXT,
  -- Formato di "note": false = testo semplice, true = Markdown. Serve al
  -- frontend per sapere come renderizzare la nota nella modale di lettura,
  -- senza doverlo indovinare dal contenuto (un testo semplice che contiene
  -- "*" o "#" verrebbe altrimenti interpretato come sintassi Markdown).
  -- Default false: tutte le note già presenti restano testo semplice.
  note_markdown   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Il CREATE TABLE sopra non viene rieseguito su una tabella che esiste già:
-- questa ALTER è ciò che aggiunge la colonna ai database creati prima
-- dell'introduzione del campo istruttore. È idempotente (IF NOT EXISTS) e
-- innocua sui database nuovi, dove la colonna c'è già.
ALTER TABLE incontro ADD COLUMN IF NOT EXISTS istruttore VARCHAR(100);

-- idx_incontro_data resta: serve alla lista globale (listIncontri() senza
-- filtro socio, incontri.service.ts) ordinata per data su tutti i soci.
CREATE INDEX IF NOT EXISTS idx_incontro_data       ON incontro(data_incontro);
-- Sostituisce idx_incontro_socio (colonna singola, ridondante: un prefisso
-- di questo indice composito copre già "WHERE socio_id = ..." da solo).
-- listIncontri(socioId) filtra per socio_id E ordina per data_incontro DESC:
-- questo indice evita il sort separato dopo il filtro.
-- created_at in coda: data_incontro è una DATE, quindi più incontri dello
-- stesso socio nello stesso giorno hanno bisogno di uno spareggio stabile.
DROP INDEX IF EXISTS idx_incontro_socio;
DROP INDEX IF EXISTS idx_incontro_socio_data;
CREATE INDEX IF NOT EXISTS idx_incontro_socio_data_creato ON incontro(socio_id, data_incontro DESC, created_at DESC);

-- ============================================================
-- Tabella: voucher
-- ============================================================
CREATE TABLE IF NOT EXISTS voucher (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id        UUID NOT NULL REFERENCES socio(id) ON DELETE CASCADE,
  data_creazione  DATE NOT NULL DEFAULT CURRENT_DATE,
  saldo_iniziale  DECIMAL(10,2) NOT NULL CHECK (saldo_iniziale >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voucher_socio ON voucher(socio_id);
-- listVouchers() senza filtro socio (vouchers.service.ts) ordina sempre per
-- data_creazione DESC su tutti i vouchers.
-- created_at in coda per lo stesso motivo di idx_movimento_voucher_data_creato:
-- data_creazione è una DATE, e più vouchers creati lo stesso giorno vanno
-- comunque ordinati in modo stabile.
DROP INDEX IF EXISTS idx_voucher_data;
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
  importo         DECIMAL(10,2) NOT NULL,  -- positivo = ricarica, negativo = addebito
  descrizione     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sostituisce idx_movimento_voucher e idx_movimento_data (colonne singole):
-- listMovimenti() (vouchers.service.ts) filtra sempre per voucher_id E ordina
-- per data_movimento DESC nella stessa query — idx_movimento_data da solo non
-- veniva mai usato (nessuna query ordina per data senza filtrare per voucher),
-- e idx_movimento_voucher è ridondante col prefisso di questo indice composito.
DROP INDEX IF EXISTS idx_movimento_voucher;
DROP INDEX IF EXISTS idx_movimento_data;
-- created_at in coda: da quando data_movimento è una DATE, due movimenti dello
-- stesso giorno hanno la stessa chiave di ordinamento e Postgres non garantisce
-- un ordine stabile fra loro (la lista poteva cambiare da un refresh all'altro).
-- listMovimenti ordina quindi per data_movimento DESC, created_at DESC, e
-- l'indice copre entrambe le colonne per evitare un sort dopo lo scan.
DROP INDEX IF EXISTS idx_movimento_voucher_data;
CREATE INDEX IF NOT EXISTS idx_movimento_voucher_data_creato ON movimento_voucher(voucher_id, data_movimento DESC, created_at DESC);
-- Un incontro genera al più un movimento (creato/aggiornato/rimosso in modo atomico insieme all'incontro)
CREATE UNIQUE INDEX IF NOT EXISTS idx_movimento_incontro_unique ON movimento_voucher(incontro_id) WHERE incontro_id IS NOT NULL;

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

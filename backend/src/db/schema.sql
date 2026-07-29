-- ============================================================
-- ClubManager - Schema SQL (PostgreSQL 16)
-- ============================================================
-- Montato automaticamente da docker-compose in
-- /docker-entrypoint-initdb.d/01-schema.sql
-- È idempotente: può essere ri-eseguito senza danni.
-- ============================================================

-- Estensione per UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
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
  attivita        VARCHAR(100),
  costo           DECIMAL(10,2) NOT NULL CHECK (costo >= 0),
  note            TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Retrocompatibilità: aggiunge la colonna se la tabella esisteva già senza
-- (installazioni precedenti a questo schema).
ALTER TABLE incontro ADD COLUMN IF NOT EXISTS attivita VARCHAR(100);

-- idx_incontro_data resta: serve alla lista globale (listIncontri() senza
-- filtro socio, incontri.service.ts) ordinata per data su tutti i soci.
CREATE INDEX IF NOT EXISTS idx_incontro_data       ON incontro(data_incontro);
-- Sostituisce idx_incontro_socio (colonna singola, ridondante: un prefisso
-- di questo indice composito copre già "WHERE socio_id = ..." da solo).
-- listIncontri(socioId) filtra per socio_id E ordina per data_incontro DESC:
-- questo indice evita il sort separato dopo il filtro.
DROP INDEX IF EXISTS idx_incontro_socio;
CREATE INDEX IF NOT EXISTS idx_incontro_socio_data ON incontro(socio_id, data_incontro DESC);

-- ============================================================
-- Tabella: voucher
-- ============================================================
CREATE TABLE IF NOT EXISTS voucher (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id        UUID NOT NULL REFERENCES socio(id) ON DELETE CASCADE,
  data_creazione  TIMESTAMP NOT NULL DEFAULT NOW(),
  saldo_iniziale  DECIMAL(10,2) NOT NULL CHECK (saldo_iniziale >= 0),
  note            TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Retrocompatibilità: rimuove la colonna se presente da installazioni
-- precedenti a questa versione dello schema (il concetto di voucher
-- attivo/chiuso è stato rimosso: un socio ha al più un voucher, punto).
ALTER TABLE voucher DROP COLUMN IF EXISTS attivo;

CREATE UNIQUE INDEX IF NOT EXISTS idx_voucher_socio ON voucher(socio_id);
-- listVouchers() senza filtro socio (vouchers.service.ts) ordina sempre per
-- data_creazione DESC su tutti i vouchers.
CREATE INDEX IF NOT EXISTS idx_voucher_data ON voucher(data_creazione DESC);

-- ============================================================
-- Tabella: movimento_voucher
-- ============================================================
CREATE TABLE IF NOT EXISTS movimento_voucher (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id      UUID NOT NULL REFERENCES voucher(id) ON DELETE CASCADE,
  incontro_id     UUID REFERENCES incontro(id) ON DELETE CASCADE,
  data_movimento  TIMESTAMP NOT NULL DEFAULT NOW(),
  importo         DECIMAL(10,2) NOT NULL,  -- positivo = ricarica, negativo = addebito
  descrizione     TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Retrocompatibilità: aggiunge la colonna se la tabella esisteva già senza
-- (installazioni precedenti a questo schema).
ALTER TABLE movimento_voucher ADD COLUMN IF NOT EXISTS incontro_id UUID REFERENCES incontro(id) ON DELETE CASCADE;

-- Sostituisce idx_movimento_voucher e idx_movimento_data (colonne singole):
-- listMovimenti() (vouchers.service.ts) filtra sempre per voucher_id E ordina
-- per data_movimento DESC nella stessa query — idx_movimento_data da solo non
-- veniva mai usato (nessuna query ordina per data senza filtrare per voucher),
-- e idx_movimento_voucher è ridondante col prefisso di questo indice composito.
DROP INDEX IF EXISTS idx_movimento_voucher;
DROP INDEX IF EXISTS idx_movimento_data;
CREATE INDEX IF NOT EXISTS idx_movimento_voucher_data ON movimento_voucher(voucher_id, data_movimento DESC);
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
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clubmanager') THEN
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO clubmanager;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO clubmanager;
  END IF;
END;
$$;

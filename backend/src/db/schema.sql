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

CREATE INDEX IF NOT EXISTS idx_incontro_socio      ON incontro(socio_id);
CREATE INDEX IF NOT EXISTS idx_incontro_data       ON incontro(data_incontro);

-- ============================================================
-- Tabella: buono
-- ============================================================
CREATE TABLE IF NOT EXISTS buono (
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
ALTER TABLE buono DROP COLUMN IF EXISTS attivo;

CREATE UNIQUE INDEX IF NOT EXISTS idx_buono_socio ON buono(socio_id);

-- ============================================================
-- Tabella: movimento_buono
-- ============================================================
CREATE TABLE IF NOT EXISTS movimento_buono (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buono_id        UUID NOT NULL REFERENCES buono(id) ON DELETE CASCADE,
  incontro_id     UUID REFERENCES incontro(id) ON DELETE CASCADE,
  data_movimento  TIMESTAMP NOT NULL DEFAULT NOW(),
  importo         DECIMAL(10,2) NOT NULL,  -- positivo = ricarica, negativo = addebito
  descrizione     TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Retrocompatibilità: aggiunge la colonna se la tabella esisteva già senza
-- (installazioni precedenti a questo schema).
ALTER TABLE movimento_buono ADD COLUMN IF NOT EXISTS incontro_id UUID REFERENCES incontro(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_movimento_buono ON movimento_buono(buono_id);
CREATE INDEX IF NOT EXISTS idx_movimento_data  ON movimento_buono(data_movimento);
-- Un incontro genera al più un movimento (creato/aggiornato/rimosso in modo atomico insieme all'incontro)
CREATE UNIQUE INDEX IF NOT EXISTS idx_movimento_incontro_unique ON movimento_buono(incontro_id) WHERE incontro_id IS NOT NULL;

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

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_buono_updated_at') THEN
    CREATE TRIGGER trg_buono_updated_at
      BEFORE UPDATE ON buono
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

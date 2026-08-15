-- ============================================================
-- Clubby Authorizer - Schema SQL (PostgreSQL 16)
-- ============================================================
-- Database separato da quello applicativo, con utente proprio: qui vivono le
-- credenziali degli utenti, e il backend dell'applicazione non deve avere
-- accesso a questa tabella nemmeno in lettura.
--
-- Montato dal workflow Infra in /docker-entrypoint-initdb.d, ed è idempotente:
-- può essere ri-eseguito senza danni.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Tabella: utente
-- ============================================================
CREATE TABLE IF NOT EXISTS utente (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- L'email è l'identificativo con cui si accede. Univoca senza distinzione
  -- di maiuscole: viene normalizzata in minuscolo prima di essere scritta
  -- (vedi normalizzaEmail in utenti.service.ts), così "Mario@x.it" e
  -- "mario@x.it" non possono diventare due account distinti.
  email            VARCHAR(255) NOT NULL UNIQUE,
  -- Password codificata come "scrypt$N$r$p$salt$hash" (vedi crypto/password.ts).
  -- Mai in chiaro, e mai restituita da nessun endpoint.
  password_hash    TEXT NOT NULL,
  nome             VARCHAR(100) NOT NULL,
  cognome          VARCHAR(100) NOT NULL,
  telefono         VARCHAR(50),
  -- Ruolo applicativo, unico per utente: sostituisce i realm roles di
  -- Keycloak. Il vincolo CHECK evita che un valore diverso da questi due
  -- finisca nei JWT e venga interpretato come "non admin" per sbaglio.
  ruolo            VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (ruolo IN ('admin', 'viewer')),
  attivo           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Impostato quando un admin azzera la password: l'utente entra con quella
  -- temporanea ma non può fare altro finché non la cambia.
  cambio_password_richiesto BOOLEAN NOT NULL DEFAULT FALSE,
  ultimo_accesso   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Il login cerca sempre per email: senza indice sarebbe una scansione della
-- tabella a ogni tentativo (il vincolo UNIQUE ne crea già uno, questo è per
-- la ricerca dell'elenco admin ordinato).
CREATE INDEX IF NOT EXISTS idx_utente_cognome_nome ON utente(cognome, nome);

-- ============================================================
-- Tabella: refresh_token
-- ============================================================
-- Un refresh token vive a lungo, quindi va potuto revocare: tenerne traccia
-- qui è ciò che permette il logout effettivo e la disattivazione immediata di
-- un utente. Gli access token, di durata breve, non sono revocabili per
-- costruzione — è il compromesso normale di questo schema.
CREATE TABLE IF NOT EXISTS refresh_token (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utente_id    UUID NOT NULL REFERENCES utente(id) ON DELETE CASCADE,
  -- Solo l'hash SHA-256 del token, mai il token stesso: chi leggesse questa
  -- tabella non deve poter impersonare nessuno.
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_token_utente ON refresh_token(utente_id);
-- Usato dalla pulizia periodica dei token scaduti.
CREATE INDEX IF NOT EXISTS idx_refresh_token_scadenza ON refresh_token(expires_at);

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
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_utente_updated_at') THEN
    CREATE TRIGGER trg_utente_updated_at
      BEFORE UPDATE ON utente
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

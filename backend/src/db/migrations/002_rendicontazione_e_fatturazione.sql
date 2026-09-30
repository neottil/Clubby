-- Rendicontazione degli incontri all'istruttore, e voci per cui è già stato
-- emesso un documento di fatturazione.
--
-- Due funzionalità distinte in un file solo perché escono nella stessa
-- versione: separarle avrebbe dato due migrazioni che nessun ambiente potrà
-- mai applicare una senza l'altra.

-- ============================================================
-- Rendicontazione degli incontri
-- ============================================================
-- L'admin segna quali incontri ha già rendicontato: il club riconosce
-- all'istruttore una percentuale su quelli tenuti in un periodo, e senza una
-- traccia non c'è modo di sapere dove ci si era fermati la volta prima.
--
-- Solo QUANDO, non quanto: il compenso non si registra qui. Il giorno in cui
-- servisse (percentuale applicata, importo riconosciuto, ristampa del
-- rendiconto) questa colonna diventerà il riferimento a una testata, e la
-- migrazione che la introdurrà potrà popolarla da qui.
--
-- Non si annulla: una volta rendicontato, un incontro resta tale. Per lo stesso
-- motivo il backend ne rifiuta la modifica e l'eliminazione.
ALTER TABLE incontro ADD COLUMN IF NOT EXISTS rendicontato_il TIMESTAMPTZ;

COMMENT ON COLUMN incontro.rendicontato_il IS
  'Quando l''incontro è stato rendicontato all''istruttore. NULL = ancora da rendicontare.';

-- Resoconti mostra, per default, i soli incontri ANCORA da rendicontare: è la
-- domanda che si fa l'admin ogni volta che apre la pagina. L'indice è parziale
-- perché la parte già rendicontata cresce senza limite e non viene mai
-- interrogata per questa via — e un indice parziale smette di occuparsene.
CREATE INDEX IF NOT EXISTS idx_incontro_da_rendicontare
  ON incontro(istruttore_id, data_incontro DESC)
  WHERE rendicontato_il IS NULL;

-- ============================================================
-- Voci di fatturazione già emesse
-- ============================================================
-- Una tabella e non una colonna perché le voci di Fatturazione non stanno in
-- una tabella sola: sono l'unione di ricariche di voucher, tesseramenti e
-- incontri non coperti da voucher (vedi fatturazione.service.ts). Segnare lo
-- stato su ognuna delle tre origini vorrebbe dire ripetere tre volte la stessa
-- colonna, e tre volte il filtro che la interroga.
--
-- Il riferimento è polimorfico — (tipo, riferimento_id) — quindi NON può avere
-- una foreign key: punta a tre tabelle diverse. Il prezzo è che una riga
-- d'origine cancellata lascerebbe qui un riferimento a vuoto, ed è il motivo
-- per cui il backend rifiuta di eliminare una voce già fatturata (e il socio
-- che se la porterebbe via in cascata).
--
-- documento_id è predisposto e per ora sempre NULL: il documento vero (numero,
-- data, intestazione, PDF) non esiste ancora come funzionalità. Quando ci sarà,
-- una tabella "documento_emesso" gli darà una casa e questa colonna diventerà
-- il suo riferimento, senza dover toccare le righe già scritte.
CREATE TABLE IF NOT EXISTS documento_emesso_voce (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Documento che comprende questa voce. NULL finché la composizione dei
  -- documenti non esiste: oggi la riga dice "già fatturata", non "sta nel
  -- documento numero X".
  documento_id   UUID,
  -- Quale delle tre fonti di Fatturazione. Stessi valori esposti dall'API.
  tipo           VARCHAR(20) NOT NULL CHECK (tipo IN ('ricarica', 'tesseramento', 'incontro')),
  -- Riga d'origine: movimento_voucher.id, tesseramento.id o incontro.id
  -- secondo `tipo`. Niente REFERENCES: la destinazione dipende dal tipo.
  riferimento_id UUID NOT NULL,
  emessa_il      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE documento_emesso_voce IS
  'Voci di Fatturazione per cui è già stato emesso un documento. Riferimento polimorfico: (tipo, riferimento_id).';

-- Una voce si fattura una volta sola. Questo indice non è solo un vincolo di
-- correttezza: è ciò che rende sicuro l'inserimento in blocco di due admin che
-- lavorano sullo stesso periodo — "ON CONFLICT DO NOTHING" scarta i doppioni, e
-- il numero di righe inserite è il numero di voci davvero fatturate ora.
CREATE UNIQUE INDEX IF NOT EXISTS idx_documento_emesso_voce_riferimento
  ON documento_emesso_voce(tipo, riferimento_id);

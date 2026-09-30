/**
 * Voci registrabili: ciò che è stato incassato dai soci, voce per voce.
 *
 * Tre fonti, e solo queste:
 *   ricarica      quanto il socio ha PAGATO per una ricarica del voucher, che
 *                 può essere meno del credito ricevuto (vedi util/ricariche.ts)
 *   tesseramento  quota di un rinnovo
 *   incontro      incontro non coperto da un voucher, quindi pagato a parte
 *
 * Restano fuori, di proposito:
 *   - gli addebiti su un voucher: il loro valore è già stato incassato con la
 *     ricarica che li copre, e contarli di nuovo lo raddoppierebbe;
 *   - il saldo iniziale importato di un voucher, che non è un incasso ma la
 *     configurazione iniziale del sistema;
 *   - il valore extra accreditato su una ricarica: è uno sconto concesso al
 *     socio, non denaro ricevuto.
 */

import { query, type QueryFn } from '../../db/client.js';
import { limiteEOffset } from '../../util/paginazione.js';

export type TipoVoce = 'ricarica' | 'tesseramento' | 'incontro';

export interface VoceDocumento {
  /** Id della riga d'origine (movimento, tesseramento o incontro). */
  id: string;
  tipo: TipoVoce;
  data: string;
  socio_id: string;
  nome: string;
  cognome: string;
  descrizione: string;
  importo: number;
  /**
   * Quando è stato emesso il documento che comprende questa voce; null se deve
   * ancora esserlo. Non si annulla, e una voce emessa non si può eliminare.
   */
  emessa_il: string | null;
  /**
   * La ricevuta che comprende questa voce, se esiste ancora come documento.
   *
   * Resta null per le voci marcate come emesse **prima** della spec 003,
   * quando l'emissione registrava soltanto il fatto senza produrre un PDF:
   * sono storico, e nell'interfaccia semplicemente non mostrano l'icona.
   */
  documento_id: string | null;
  /**
   * Anno e numero della ricevuta: insieme sono il codice che l'utente vede e
   * il nome con cui il file viene scaricato. Null esattamente quando lo è
   * `documento_id`.
   */
  documento_anno: number | null;
  documento_numero: number | null;
}

export interface ListVociOptions {
  socioId?: string;
  /** Estremi inclusi, "YYYY-MM-DD". */
  da?: string;
  a?: string;
  /**
   * Comprende anche le voci per cui un documento è già stato emesso.
   *
   * Qui il default è l'opposto di quello degli incontri: la pagina Ricevute
   * esiste per sapere che cosa resta da registrare, e chi la apre non vuole
   * rivedere
   * ogni volta tutto lo storico già emesso. Le voci emesse tornano solo se le
   * si chiede.
   */
  includiEmesse?: boolean;
  /**
   * Restringe alle sole voci indicate, per coppia (tipo, id).
   *
   * Serve all'emissione, che deve **ricalcolare dal database** gli importi
   * delle righe selezionate invece di fidarsi di quelli mandati dal client.
   */
  riferimenti?: RiferimentoVoce[];
  limit?: number;
  offset?: number;
}

export interface PaginaVoci {
  rows: VoceDocumento[];
  total: number;
  /** Somma degli importi di tutte le voci filtrate, non della sola pagina. */
  totaleImporto: number;
}

export async function listVoci(
  options: ListVociOptions = {},
  q: QueryFn = query
): Promise<PaginaVoci> {
  const { limit, offset } = limiteEOffset(options);

  const where: string[] = [];
  const params: Record<string, unknown> = { limit, offset };
  if (options.socioId) {
    where.push('v.socio_id = :socioId');
    params.socioId = options.socioId;
  }
  // CAST(... AS DATE) e non "::date", come in incontri.service.ts.
  if (options.da) {
    where.push('v.data >= CAST(:da AS DATE)');
    params.da = options.da;
  }
  if (options.a) {
    where.push('v.data <= CAST(:a AS DATE)');
    params.a = options.a;
  }
  // Il filtro sulle voci già emesse sta QUI e non dentro i rami della UNION:
  // la JOIN con documento_emesso_voce è una sola, sul risultato unito, e vale
  // per tutte e tre le fonti senza ripeterla tre volte.
  if (!options.includiEmesse) {
    where.push('d.id IS NULL');
  }
  // Coppie (tipo, id): il confronto per tupla vale per tutte e tre le origini
  // in una volta, senza un OR per ciascuna.
  if (options.riferimenti) {
    where.push(
      `(v.tipo, v.id) IN (
         SELECT tipo, CAST(id AS UUID)
           FROM UNNEST(CAST(:tipiSel AS TEXT[]), CAST(:idsSel AS TEXT[])) AS s(tipo, id)
       )`
    );
    params.tipiSel = options.riferimenti.map(r => r.tipo);
    params.idsSel = options.riferimenti.map(r => r.id);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  // Totali con le funzioni finestra, come listIncontri: valutate prima di
  // LIMIT/OFFSET, coprono l'intero risultato filtrato.
  const result = await q(
    `WITH voci AS (
       -- COALESCE(importo_pagato, importo): dove una ricarica accredita al
       -- socio più di quanto ha pagato (RECHARGE_MODE percentage/map), qui
       -- conta solo il pagato — è l'unico denaro incassato. Il valore extra
       -- vive sul voucher, e registrarlo dichiarerebbe un ricavo inesistente.
       -- importo_pagato è NULL quando le due cose coincidono, cioè per tutte
       -- le ricariche registrate prima di questa funzionalità.
       SELECT m.id, 'ricarica' AS tipo, m.data_movimento AS data, b.socio_id,
              COALESCE(NULLIF(m.descrizione, ''), 'Ricarica voucher') AS descrizione,
              COALESCE(m.importo_pagato, m.importo) AS importo, m.created_at
       FROM movimento_voucher m
       JOIN voucher b ON b.id = m.voucher_id
       WHERE m.tipo = 'ricarica'
       UNION ALL
       SELECT t.id, 'tesseramento', t.data_rinnovo, t.socio_id,
              'Tesseramento fino al ' || to_char(t.scadenza, 'DD/MM/YYYY'),
              t.importo, t.created_at
       FROM tesseramento t
       UNION ALL
       SELECT i.id, 'incontro', i.data_incontro, i.socio_id,
              'Incontro: ' || a.nome,
              i.costo, i.created_at
       FROM incontro i
       JOIN attivita a ON a.id = i.attivita_id
       WHERE NOT EXISTS (SELECT 1 FROM movimento_voucher m WHERE m.incontro_id = i.id)
     )
     SELECT v.id, v.tipo, v.data, v.socio_id, s.nome, s.cognome, v.descrizione, v.importo,
            d.emessa_il, d.documento_id, doc.anno AS documento_anno, doc.numero AS documento_numero,
            COUNT(*) OVER() AS total_count,
            SUM(v.importo) OVER() AS totale_importo
     FROM voci v
     JOIN socio s ON s.id = v.socio_id
     -- LEFT JOIN e non NOT EXISTS: la stessa giuntura serve sia a filtrare
     -- (d.id IS NULL) sia a portare "emessa_il" nelle righe quando le voci già
     -- emesse vengono chieste. L'indice unico su (tipo, riferimento_id) la
     -- rende una ricerca puntuale per riga.
     LEFT JOIN documento_emesso_voce d ON d.tipo = v.tipo AND d.riferimento_id = v.id
     -- Il documento vero e proprio serve solo per anno e numero, che insieme
     -- sono il codice mostrato all'utente. Resta una LEFT JOIN su chiave
     -- primaria, e per le voci marcate prima della 003 (documento_id NULL) non
     -- aggiunge nulla.
     LEFT JOIN documento doc ON doc.id = d.documento_id
     ${whereSql}
     -- I tesseramenti per primi: sono le voci che l'admin cerca per prime, e
     -- in mezzo alle ricariche di un anno di attività si perderebbero. Dentro
     -- ogni gruppo resta l'ordine per data, dalla più recente.
     ORDER BY (v.tipo = 'tesseramento') DESC, v.data DESC, v.created_at DESC, v.id
     LIMIT :limit OFFSET :offset`,
    params
  );

  const prima = result.rows[0];
  const rows = result.rows.map(row => {
    const { total_count: _n, totale_importo: _t, ...voce } = row as Record<string, unknown>;
    return voce as unknown as VoceDocumento;
  });

  return {
    rows,
    total: prima ? Number(prima.total_count) : 0,
    totaleImporto: prima ? Number(prima.totale_importo) : 0,
  };
}

/** Una voce da marcare come registrarla: la coppia che la identifica. */
export interface RiferimentoVoce {
  tipo: TipoVoce;
  id: string;
}

/**
 * Lega le voci indicate al documento appena creato, e risponde con quante
 * sono state marcate DAVVERO in questa chiamata.
 *
 * `ON CONFLICT DO NOTHING` sull'indice unico (tipo, riferimento_id) garantisce
 * che una voce non finisca in due ricevute diverse. Il chiamante confronta
 * `richieste` con `emesse`: se non coincidono, qualcuno ha registrato una di
 * quelle voci fra l'anteprima e la conferma, l'importo del documento non è più
 * quello visto a schermo, e la transazione va annullata.
 *
 * Nessuna verifica che il riferimento esista davvero: sarebbe una query per
 * ciascuna delle tre origini, e una voce inesistente non può arrivare qui se
 * non da un client che se la inventa — nel qual caso la riga scritta non
 * comparirà comunque in nessun elenco, perché la JOIN parte dalle voci vere.
 */
export async function segnaVociEmesse(
  voci: RiferimentoVoce[],
  documentoId: string,
  q: QueryFn = query
): Promise<{ richieste: number; emesse: number }> {
  if (voci.length === 0) return { richieste: 0, emesse: 0 };

  const result = await q(
    `INSERT INTO documento_emesso_voce (tipo, riferimento_id, documento_id)
     SELECT tipo, CAST(riferimento_id AS UUID), CAST(:documentoId AS UUID)
       FROM UNNEST(CAST(:tipi AS TEXT[]), CAST(:ids AS TEXT[])) AS t(tipo, riferimento_id)
     ON CONFLICT (tipo, riferimento_id) DO NOTHING
     RETURNING id`,
    { tipi: voci.map(v => v.tipo), ids: voci.map(v => v.id), documentoId }
  );
  return { richieste: voci.length, emesse: result.rows.length };
}

/**
 * Le voci indicate, ricalcolate dal database: importo, data e descrizione.
 *
 * L'importo del documento **non si prende mai dal client**. Chi emette manda
 * la coppia (tipo, id) di ogni riga; quanto vale ciascuna lo decide questa
 * query, che è la stessa usata dall'elenco.
 *
 * Restituisce solo le voci del socio indicato, esistenti e non ancora
 * registrate: se il chiamante ne riceve meno di quante ne ha chieste, la
 * selezione non è più valida e il documento non va emesso.
 *
 * `limit` pari al numero di voci chieste, non alla pagina di default: qui non
 * si sta paginando niente, si sta risolvendo un insieme già noto.
 */
export async function vociPerDocumento(
  socioId: string,
  voci: RiferimentoVoce[],
  q: QueryFn = query
): Promise<VoceDocumento[]> {
  if (voci.length === 0) return [];

  const { rows } = await listVoci(
    { socioId, riferimenti: voci, includiEmesse: false, limit: voci.length },
    q
  );
  return rows;
}

/**
 * Se la voce indicata è già stata registrata. Serve alle cancellazioni: una
 * riga d'origine che compare in un documento emesso non si può eliminare,
 * altrimenti quel documento riferirebbe qualcosa che non esiste più.
 */
export async function voceGiaEmessa(tipo: TipoVoce, id: string, q: QueryFn = query): Promise<boolean> {
  const result = await q(
    `SELECT 1 FROM documento_emesso_voce WHERE tipo = :tipo AND riferimento_id = :id`,
    { tipo, id }
  );
  return result.rows.length > 0;
}

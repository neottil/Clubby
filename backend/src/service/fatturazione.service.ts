/**
 * Fatturazione: ciò che è stato fatturato ai soci, voce per voce.
 *
 * Tre fonti, e solo queste:
 *   ricarica      credito acquistato su un voucher (movimenti di tipo 'ricarica')
 *   tesseramento  quota di un rinnovo
 *   incontro      incontro non coperto da un voucher, quindi pagato a parte
 *
 * Restano fuori, di proposito:
 *   - gli addebiti su un voucher: il loro valore è già stato fatturato con la
 *     ricarica che li copre, e contarli di nuovo lo raddoppierebbe;
 *   - il saldo iniziale importato di un voucher, che non è un incasso ma la
 *     configurazione iniziale del sistema.
 */

import { query } from '../db/client.js';
import { limiteEOffset } from '../util/paginazione.js';

export type TipoVoce = 'ricarica' | 'tesseramento' | 'incontro';

export interface VoceFatturazione {
  /** Id della riga d'origine (movimento, tesseramento o incontro). */
  id: string;
  tipo: TipoVoce;
  data: string;
  socio_id: string;
  nome: string;
  cognome: string;
  descrizione: string;
  importo: number;
}

export interface ListFatturazioneOptions {
  socioId?: string;
  /** Estremi inclusi, "YYYY-MM-DD". */
  da?: string;
  a?: string;
  limit?: number;
  offset?: number;
}

export interface PaginaFatturazione {
  rows: VoceFatturazione[];
  total: number;
  /** Somma degli importi di tutte le voci filtrate, non della sola pagina. */
  totaleImporto: number;
}

export async function listFatturazione(options: ListFatturazioneOptions = {}): Promise<PaginaFatturazione> {
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
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  // Totali con le funzioni finestra, come listIncontri: valutate prima di
  // LIMIT/OFFSET, coprono l'intero risultato filtrato.
  const result = await query(
    `WITH voci AS (
       SELECT m.id, 'ricarica' AS tipo, m.data_movimento AS data, b.socio_id,
              COALESCE(NULLIF(m.descrizione, ''), 'Ricarica voucher') AS descrizione,
              m.importo, m.created_at
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
            COUNT(*) OVER() AS total_count,
            SUM(v.importo) OVER() AS totale_importo
     FROM voci v
     JOIN socio s ON s.id = v.socio_id
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
    return voce as unknown as VoceFatturazione;
  });

  return {
    rows,
    total: prima ? Number(prima.total_count) : 0,
    totaleImporto: prima ? Number(prima.totale_importo) : 0,
  };
}

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient } from '../api/client';
import { config, istruttoriAbilitati } from '../config';
import DateRangeFilter, { isInDateRange } from '../components/DateRangeFilter';
import TableScroll from '../components/TableScroll';
import { theme } from '../theme';

interface Incontro {
  id: string;
  data_incontro: string;
  attivita: string;
  istruttore: string | null;
  costo: number;
}

/** Una riga del prospetto: un'attività con quanti incontri e quanto costo. */
interface RigaAttivita {
  attivita: string;
  incontri: number;
  costo: number;
}

/** Un blocco del resoconto: le attività di un istruttore, con il suo totale. */
interface Prospetto {
  /** null quando gli istruttori non sono configurati: prospetto unico, senza intestazione. */
  istruttore: string | null;
  righe: RigaAttivita[];
  totaleIncontri: number;
  totaleCosto: number;
}

/**
 * Raggruppa gli incontri per attività e somma costi e conteggi.
 * Ordine per costo decrescente: in un resoconto la voce che pesa più sul
 * totale è quella che si cerca per prima.
 */
function aggregaPerAttivita(incontri: Incontro[]): RigaAttivita[] {
  const perAttivita = new Map<string, RigaAttivita>();
  for (const i of incontri) {
    const riga = perAttivita.get(i.attivita) ?? { attivita: i.attivita, incontri: 0, costo: 0 };
    riga.incontri += 1;
    riga.costo += Number(i.costo);
    perAttivita.set(i.attivita, riga);
  }
  return [...perAttivita.values()].sort((a, b) => b.costo - a.costo);
}

export default function ResocontoPage() {
  const { token } = useAuth();
  const api = createApiClient(token);

  const [incontri, setIncontri] = useState<Incontro[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [dataDa, setDataDa]     = useState('');
  const [dataA, setDataA]       = useState('');

  useEffect(() => {
    (async () => {
      try {
        // Come IncontriPage: l'admin scarica l'elenco completo e il resoconto
        // si calcola qui. Non serve un endpoint di aggregazione dedicato — i
        // dati sono già quelli che la pagina Incontri carica comunque.
        setIncontri(await api.getIncontri());
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const nelPeriodo = useMemo(
    () => incontri.filter(i => isInDateRange(i.data_incontro, dataDa, dataA)),
    [incontri, dataDa, dataA]
  );

  const prospetti = useMemo<Prospetto[]>(() => {
    const componi = (istruttore: string | null, gruppo: Incontro[]): Prospetto => {
      const righe = aggregaPerAttivita(gruppo);
      return {
        istruttore,
        righe,
        totaleIncontri: righe.reduce((n, r) => n + r.incontri, 0),
        totaleCosto:    righe.reduce((n, r) => n + r.costo, 0),
      };
    };

    // Istruttori non configurati: l'associazione ne ha uno solo e attribuire
    // gli incontri a un nome non avrebbe senso. Un unico prospetto, senza
    // intestazione, su tutti gli incontri del periodo.
    if (!istruttoriAbilitati) {
      return nelPeriodo.length > 0 ? [componi(null, nelPeriodo)] : [];
    }

    // Ordine degli istruttori: quello della configurazione, non quello dei
    // dati, così il resoconto ha la stessa sequenza da un periodo all'altro.
    // Un istruttore senza incontri nel periodo viene omesso: una tabella vuota
    // col suo nome sarebbe rumore.
    return config.istruttori
      .map(nome => componi(nome, nelPeriodo.filter(i => i.istruttore === nome)))
      .filter(p => p.righe.length > 0);
  }, [nelPeriodo]);

  // Incontri che nessun prospetto include: senza istruttore (registrati prima
  // dell'introduzione del campo) o con un nome non più in elenco. Non hanno un
  // gruppo proprio, ma il loro costo va dichiarato: altrimenti la somma dei
  // prospetti sarebbe silenziosamente più bassa del totale reale.
  const esclusi = useMemo(() => {
    if (!istruttoriAbilitati) return { incontri: 0, costo: 0 };
    const fuori = nelPeriodo.filter(i => !i.istruttore || !config.istruttori.includes(i.istruttore));
    return {
      incontri: fuori.length,
      costo: fuori.reduce((n, i) => n + Number(i.costo), 0),
    };
  }, [nelPeriodo]);

  const totaleGenerale = useMemo(() => ({
    incontri: prospetti.reduce((n, p) => n + p.totaleIncontri, 0),
    costo:    prospetti.reduce((n, p) => n + p.totaleCosto, 0),
  }), [prospetti]);

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Resoconto</h2>
      </div>
      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.filterRow}>
        <DateRangeFilter from={dataDa} to={dataA} onFromChange={setDataDa} onToChange={setDataA} />
        <span style={styles.periodo}>
          {dataDa || dataA
            ? `Periodo: ${dataDa || 'inizio'} → ${dataA || 'oggi'}`
            : 'Tutti gli incontri registrati'}
        </span>
      </div>

      {prospetti.length === 0 ? (
        <p style={styles.empty}>
          {dataDa || dataA ? 'Nessun incontro nel periodo selezionato.' : 'Nessun incontro registrato.'}
        </p>
      ) : (
        <>
          {prospetti.map(p => (
            <section key={p.istruttore ?? 'unico'} style={styles.card}>
              {/* Senza istruttori configurati il prospetto è unico e non ha
                  intestazione: non c'è un nome a cui attribuirlo. */}
              {p.istruttore && <h3 style={styles.istruttore}>{p.istruttore}</h3>}
              <TableScroll>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Attività</th>
                      <th style={{ ...styles.th, ...styles.thNum }}>Incontri</th>
                      <th style={{ ...styles.th, ...styles.thNum }}>Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.righe.map(r => (
                      <tr key={r.attivita} style={styles.tr}>
                        <td style={styles.td}>{r.attivita}</td>
                        <td style={{ ...styles.td, ...styles.tdNum }}>{r.incontri}</td>
                        <td style={{ ...styles.td, ...styles.tdNum }}>€ {r.costo.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ ...styles.td, ...styles.tdTotale }}>Totale</td>
                      <td style={{ ...styles.td, ...styles.tdTotale, ...styles.tdNum }}>{p.totaleIncontri}</td>
                      <td style={{ ...styles.td, ...styles.tdTotale, ...styles.tdNum }}>€ {p.totaleCosto.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </TableScroll>
            </section>
          ))}

          {/* Totale fra istruttori: mostrato solo quando i prospetti sono più
              di uno, altrimenti ripeterebbe il totale già scritto sopra. */}
          {prospetti.length > 1 && (
            <div style={styles.totaleGenerale}>
              <span>Totale complessivo</span>
              <span>{totaleGenerale.incontri} incontri</span>
              <strong>€ {totaleGenerale.costo.toFixed(2)}</strong>
            </div>
          )}

          {esclusi.incontri > 0 && (
            <p style={styles.nota}>
              {esclusi.incontri === 1
                ? '1 incontro del periodo non è incluso nei prospetti'
                : `${esclusi.incontri} incontri del periodo non sono inclusi nei prospetti`}
              {' '}(€ {esclusi.costo.toFixed(2)}): senza istruttore, o con un istruttore non più
              {' '}presente in elenco.
              {' '}{esclusi.incontri === 1 ? 'Lo si trova' : 'Li si trova'} nella pagina Incontri.
            </p>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: 32 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  loading: { padding: 48, textAlign: 'center', color: '#666' },
  error: { background: '#fee', color: theme.danger, padding: '10px 16px', borderRadius: 8, marginBottom: 16 },
  filterRow: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  periodo: { fontSize: 13, color: '#666' },
  card: { background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  istruttore: { margin: '0 0 12px', fontSize: 17, fontWeight: 700, color: '#333' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '10px 16px', textAlign: 'left', background: '#f1f5f9', fontSize: 13, fontWeight: 600, color: '#555', borderBottom: '1px solid #e5e7eb' },
  // Numeri e importi allineati a destra: incolonnati si confrontano a vista
  // senza dover leggere cifra per cifra.
  thNum: { textAlign: 'right' },
  tr: { borderBottom: '1px solid #f1f5f9' },
  td: { padding: '11px 16px', fontSize: 14, color: '#333' },
  tdNum: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  tdTotale: { fontWeight: 700, borderTop: '2px solid #e5e7eb' },
  totaleGenerale: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 20, flexWrap: 'wrap',
    padding: '14px 20px', marginBottom: 20, borderRadius: 12,
    background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    fontSize: 14, color: '#333',
  },
  nota: { fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
};

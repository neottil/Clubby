/**
 * Fatturazione (solo admin): ciò che è stato fatturato ai soci, con il totale
 * dei filtri applicati.
 *
 * Tre voci, e solo queste: ricariche dei voucher, quote di tesseramento e
 * incontri non coperti da voucher. Gli incontri pagati col voucher, le
 * rettifiche e il saldo importato di un voucher non compaiono (il perché è in
 * fatturazione.service.ts nel backend).
 */

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient, DIMENSIONE_PAGINA, type VoceFatturazione } from '../api/client';
import SocioSelect from '../components/SocioSelect';
import DateRangeFilter, { dataCompleta } from '../components/DateRangeFilter';
import TableScroll from '../components/TableScroll';
import Avviso from '../components/Avviso';
import CaricaAltri from '../components/CaricaAltri';
import TotaliFiltri from '../components/TotaliFiltri';
import Etichetta from '../components/Etichetta';
import { euro, dataIso } from '../utils/formato';
import { ui } from '../styles/ui';

interface Socio { id: string; nome: string; cognome: string; }

const VOCI: Record<VoceFatturazione['tipo'], { etichetta: string; colore: string; sfondo: string }> = {
  ricarica:     { etichetta: 'Ricarica voucher', colore: '#1d4ed8', sfondo: '#eff6ff' },
  tesseramento: { etichetta: 'Tesseramento',     colore: '#92400e', sfondo: '#fffbeb' },
  incontro:     { etichetta: 'Incontro',         colore: '#374151', sfondo: '#f3f4f6' },
};

export default function FatturazionePage() {
  const { token } = useAuth();
  const api = createApiClient(token);

  const [soci, setSoci]       = useState<Socio[]>([]);
  const [socioId, setSocioId] = useState('');
  const [dataDa, setDataDa]   = useState('');
  const [dataA, setDataA]     = useState('');

  const [voci, setVoci]                   = useState<VoceFatturazione[]>([]);
  const [total, setTotal]                 = useState(0);
  const [totaleImporto, setTotaleImporto] = useState(0);
  const [loading, setLoading]             = useState(true);
  // Come in ElencoIncontri: dopo il primo caricamento i filtri restano montati
  // durante i ricaricamenti, altrimenti il calendario si chiuderebbe.
  const [caricato, setCaricato]           = useState(false);
  const [loadingMore, setLoadingMore]     = useState(false);
  const [error, setError]                 = useState('');

  // Scarta le risposte arrivate fuori ordine dopo un cambio di filtro rapido.
  const richiestaCorrente = useRef(0);

  useEffect(() => {
    api.getSoci().then(setSoci).catch((e: any) => setError(e.message));
  }, []);

  const da = dataCompleta(dataDa);
  const a  = dataCompleta(dataA);
  const filtri = () => ({ socio_id: socioId || undefined, da, a, limit: DIMENSIONE_PAGINA });

  const load = async () => {
    const richiesta = ++richiestaCorrente.current;
    setLoading(true);
    setError('');
    try {
      const r = await api.getFatturazione({ ...filtri(), offset: 0 });
      if (richiesta !== richiestaCorrente.current) return;
      setVoci(r.data);
      setTotal(r.total);
      setTotaleImporto(Number(r.totale_importo ?? 0));
      setCaricato(true);
    } catch (e: any) {
      if (richiesta === richiestaCorrente.current) setError(e.message);
    } finally {
      if (richiesta === richiestaCorrente.current) setLoading(false);
    }
  };

  const caricaAltri = async () => {
    const richiesta = richiestaCorrente.current;
    setLoadingMore(true);
    try {
      const r = await api.getFatturazione({ ...filtri(), offset: voci.length });
      if (richiesta !== richiestaCorrente.current) return;
      setVoci(prev => [...prev, ...r.data]);
      setTotal(r.total);
      setTotaleImporto(Number(r.totale_importo ?? 0));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  };

  // Solo date complete: mentre si digita l'anno non si interroga il backend.
  useEffect(() => { load(); }, [socioId, da, a]);

  const filtriAttivi = !!(socioId || da || a);

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Fatturazione</h2>
      <p style={styles.hint}>
        Ricariche dei voucher, quote di tesseramento e incontri non coperti da voucher. Gli incontri
        pagati con il voucher non compaiono: il loro valore è già nella ricarica che li copre.
      </p>
      {error && <Avviso tipo='errore' messaggio={error} onChiudi={() => setError('')} />}

      <div style={styles.filterRow}>
        <div style={styles.filterSocio}>
          <SocioSelect
            soci={soci}
            value={socioId}
            onChange={setSocioId}
            placeholder='Filtra per socio...'
            resetLabel='Tutti i soci'
          />
        </div>
        <DateRangeFilter from={dataDa} to={dataA} onFromChange={setDataDa} onToChange={setDataA} />
        <TotaliFiltri numero={total} singolare='voce' plurale='voci' importo={totaleImporto} />
      </div>

      {!caricato ? (
        <div style={styles.loading}>Caricamento...</div>
      ) : (
        <>
          <TableScroll>
            <table style={{ ...styles.table, opacity: loading ? 0.55 : 1 }} aria-busy={loading}>
              <thead>
                <tr>
                  {['Data', 'Socio', 'Voce', 'Descrizione', 'Importo'].map(h => (
                    <th key={h} style={h === 'Importo' ? { ...styles.th, textAlign: 'right' } : styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {voci.map(v => (
                  <tr key={`${v.tipo}:${v.id}`} style={styles.tr}>
                    <td style={styles.td}>{dataIso(v.data)}</td>
                    <td style={styles.td}>{v.cognome} {v.nome}</td>
                    <td style={styles.td}>
                      <Etichetta testo={VOCI[v.tipo].etichetta} colore={VOCI[v.tipo].colore} sfondo={VOCI[v.tipo].sfondo} />
                    </td>
                    <td style={styles.td}>{v.descrizione}</td>
                    <td style={{ ...styles.td, ...styles.importo }}>{euro(v.importo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          {voci.length === 0 && !loading && !error && (
            <p style={styles.empty}>
              {filtriAttivi ? 'Nessuna voce corrisponde ai filtri.' : 'Nessuna voce da fatturare.'}
            </p>
          )}

          <CaricaAltri caricati={voci.length} totale={total} inCaricamento={loadingMore} onCaricaAltri={caricaAltri} />
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  ...ui,
  title: { margin: '0 0 8px', fontSize: 22, fontWeight: 700 },
  hint: { color: '#666', fontSize: 13, margin: '0 0 20px', maxWidth: 760, lineHeight: 1.5 },
  filterSocio: { width: 260, maxWidth: '100%' },
  importo: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontWeight: 600 },
};

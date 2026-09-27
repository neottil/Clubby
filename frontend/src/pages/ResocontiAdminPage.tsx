/**
 * Resoconti dell'admin: gli incontri di un istruttore o di un socio a scelta,
 * con i filtri per periodo e attività e i totali del risultato filtrato.
 *
 * Diverso dalla pagina Resoconto, che mostra a un istruttore i soli incontri
 * tenuti da lui: qui l'admin consulta quelli di chiunque, in sola lettura —
 * la gestione degli incontri resta nella pagina Incontri.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient, nomeIstruttore, type Istruttore, type Socio } from '../api/client';
import ElencoIncontri from '../components/ElencoIncontri';
import SocioSelect from '../components/SocioSelect';
import Avviso from '../components/Avviso';
import { theme } from '../theme';
import { ui } from '../styles/ui';
import { messaggioErrore } from '../utils/errori';


type Scheda = 'istruttore' | 'socio';

const SCHEDE: [Scheda, string][] = [
  ['istruttore', 'Per istruttore'],
  ['socio', 'Per socio'],
];

export default function ResocontiAdminPage() {
  const { token } = useAuth();
  const api = createApiClient(token);

  const [scheda, setScheda]             = useState<Scheda>('istruttore');
  const [istruttori, setIstruttori]     = useState<Istruttore[]>([]);
  const [soci, setSoci]                 = useState<Socio[]>([]);
  const [istruttoreId, setIstruttoreId] = useState('');
  const [socioId, setSocioId]           = useState('');
  const [error, setError]               = useState('');

  useEffect(() => {
    Promise.all([api.getIstruttori(), api.getSoci()])
      .then(([ist, s]) => {
        setIstruttori([...ist].sort((a, b) => nomeIstruttore(a).localeCompare(nomeIstruttore(b))));
        setSoci(s);
      })
      .catch(e => setError(messaggioErrore(e)));
  }, []);

  const selezione = scheda === 'istruttore' ? istruttoreId : socioId;

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Resoconti</h2>
      {error && <Avviso tipo='errore' messaggio={error} onChiudi={() => setError('')} />}

      <div role='tablist' aria-label='Tipo di resoconto' style={styles.tabs}>
        {SCHEDE.map(([valore, etichetta]) => (
          <button
            key={valore}
            role='tab'
            id={`tab-${valore}`}
            aria-selected={scheda === valore}
            aria-controls='pannello-resoconto'
            style={{ ...styles.tab, ...(scheda === valore ? styles.tabAttiva : {}) }}
            onClick={() => setScheda(valore)}
          >
            {etichetta}
          </button>
        ))}
      </div>

      <div role='tabpanel' id='pannello-resoconto' aria-labelledby={`tab-${scheda}`}>
        <div style={styles.scelta}>
          {scheda === 'istruttore' ? (
            <>
              <label style={styles.label} htmlFor='resoconto-istruttore'>Istruttore</label>
              <select
                id='resoconto-istruttore'
                style={styles.selectPieno}
                value={istruttoreId}
                onChange={e => setIstruttoreId(e.target.value)}
              >
                <option value=''>— Scegli un istruttore</option>
                {istruttori.map(i => (
                  <option key={i.id} value={i.id}>{nomeIstruttore(i)}</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label style={styles.label}>Socio</label>
              <SocioSelect soci={soci} value={socioId} onChange={setSocioId} />
            </>
          )}
        </div>

        {/* key: cambiando scheda o selezione l'elenco riparte da zero, filtri
            compresi — un periodo scelto per un istruttore non deve restare
            applicato, invisibile, al socio scelto dopo. */}
        {selezione ? (
          <ElencoIncontri
            key={`${scheda}:${selezione}`}
            istruttoreId={scheda === 'istruttore' ? istruttoreId : undefined}
            socioId={scheda === 'socio' ? socioId : undefined}
            mostraTotali
            solaLettura
          />
        ) : (
          <p style={styles.vuoto}>
            {scheda === 'istruttore'
              ? 'Scegli un istruttore per vederne gli incontri tenuti.'
              : 'Scegli un socio per vederne gli incontri.'}
          </p>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  ...ui,
  title: { margin: '0 0 24px', fontSize: 22, fontWeight: 700 },
  tabs: { display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 20 },
  tab: {
    background: 'transparent', border: 'none', borderBottom: '3px solid transparent',
    padding: '10px 18px', minHeight: 44, cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#666',
    marginBottom: -1,
  },
  // borderBottom intero e non il solo colore: togliendo una proprietà
  // longhand sopra uno shorthand, React lascia il bordo del colore del testo.
  tabAttiva: { color: '#222', borderBottom: `3px solid ${theme.primary}` },
  scelta: { maxWidth: 360, marginBottom: 20 },
  vuoto: { color: '#999', marginTop: 32, textAlign: 'center' },
};

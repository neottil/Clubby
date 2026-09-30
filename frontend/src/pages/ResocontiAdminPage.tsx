/**
 * Resoconti dell'admin: gli incontri tenuti da un istruttore, con i filtri per
 * periodo e attività, i totali del risultato filtrato e la rendicontazione.
 *
 * È la pagina da cui il club rendiconta all'istruttore il lavoro svolto: si
 * scelgono gli incontri da riconoscere e si marcano come rendicontati, così la
 * volta successiva si riparte da dove ci si era fermati.
 *
 * Non c'è più una scheda "per socio": mostrava gli stessi incontri della pagina
 * Incontri, che per l'admin li elenca già tutti con la ricerca sul nominativo e
 * ora anche con i totali del periodo. Due strade per lo stesso dato erano una
 * di troppo.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient, nomeIstruttore, type Istruttore } from '../api/client';
import ElencoIncontri from '../components/ElencoIncontri';
import Avviso from '../components/Avviso';
import { ui } from '../styles/ui';
import { messaggioErrore } from '../utils/errori';

export default function ResocontiAdminPage() {
  const { token } = useAuth();
  const api = createApiClient(token);

  const [istruttori, setIstruttori]     = useState<Istruttore[]>([]);
  const [istruttoreId, setIstruttoreId] = useState('');
  const [error, setError]               = useState('');

  useEffect(() => {
    api.getIstruttori()
      .then(ist => setIstruttori([...ist].sort((a, b) => nomeIstruttore(a).localeCompare(nomeIstruttore(b)))))
      .catch(e => setError(messaggioErrore(e)));
  }, []);

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Resoconti</h2>
      {error && <Avviso tipo='errore' messaggio={error} onChiudi={() => setError('')} />}

      <div style={styles.scelta}>
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
      </div>

      {/* key: cambiando istruttore l'elenco riparte da zero, filtri e selezione
          compresi — un periodo scelto per uno non deve restare applicato,
          invisibile, a quello scelto dopo. */}
      {istruttoreId ? (
        <ElencoIncontri
          key={istruttoreId}
          istruttoreId={istruttoreId}
          mostraTotali
          solaLettura
          rendicontazione
        />
      ) : (
        <p style={styles.vuoto}>Scegli un istruttore per vederne gli incontri tenuti.</p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  ...ui,
  title: { margin: '0 0 24px', fontSize: 22, fontWeight: 700 },
  scelta: { maxWidth: 420, marginBottom: 20 },
  vuoto: { color: '#666', fontSize: 14 },
};

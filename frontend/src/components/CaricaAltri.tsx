import { ui } from '../styles/ui';

interface CaricaAltriProps {
  /** Righe già mostrate. */
  caricati: number;
  /** Righe che soddisfano i filtri in tutto. */
  totale: number;
  inCaricamento: boolean;
  onCaricaAltri: () => void;
}

/**
 * Piede di un elenco caricato a blocchi: dice a che punto si è del totale e,
 * se c'è dell'altro, offre "Carica altri". Il contatore evita che "Carica
 * altri" sembri un pozzo senza fondo. Non mostra nulla a elenco vuoto.
 */
export default function CaricaAltri({ caricati, totale, inCaricamento, onCaricaAltri }: CaricaAltriProps) {
  if (caricati === 0) return null;

  return (
    <div style={styles.paginazione}>
      <span style={styles.conteggio}>{caricati} di {totale}</span>
      {caricati < totale && (
        <button style={ui.btnSecondary} onClick={onCaricaAltri} disabled={inCaricamento}>
          {inCaricamento ? 'Caricamento...' : 'Carica altri'}
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  paginazione: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16, flexWrap: 'wrap' },
  conteggio: { fontSize: 13, color: '#666' },
};

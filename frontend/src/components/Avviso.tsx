import { useEffect, useRef } from 'react';
import { theme } from '../theme';

/** Dopo quanto un avviso si chiude da solo. */
const DURATA_MS = 20_000;

interface AvvisoProps {
  tipo: 'errore' | 'successo';
  messaggio: string;
  onChiudi: () => void;
}

/**
 * Messaggio di esito di un'azione: chiudibile con la X, e chiuso da solo dopo
 * 20 secondi.
 */
export default function Avviso({ tipo, messaggio, onChiudi }: AvvisoProps) {
  // Il callback cambia identità a ogni render della pagina: tenerlo in un ref
  // evita che il timer riparta da zero a ogni aggiornamento.
  const chiudi = useRef(onChiudi);
  chiudi.current = onChiudi;

  // Riparte a ogni messaggio nuovo: un secondo errore resta visibile per i
  // suoi 20 secondi, non per quelli avanzati dal precedente.
  useEffect(() => {
    const timer = window.setTimeout(() => chiudi.current(), DURATA_MS);
    return () => window.clearTimeout(timer);
  }, [messaggio]);

  return (
    <div
      role={tipo === 'errore' ? 'alert' : 'status'}
      style={{ ...styles.avviso, ...(tipo === 'errore' ? styles.errore : styles.successo) }}
    >
      <span style={styles.testo}>{messaggio}</span>
      <button type='button' style={styles.chiudi} onClick={() => chiudi.current()} aria-label='Chiudi il messaggio'>
        ×
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  avviso: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '6px 6px 6px 16px', borderRadius: 8, marginBottom: 16,
  },
  errore: { background: '#fee', color: theme.danger },
  successo: { background: '#f0fdf4', color: theme.success },
  testo: { flex: 1, padding: '4px 0', lineHeight: 1.5, whiteSpace: 'pre-line' },
  chiudi: {
    flexShrink: 0, width: 32, height: 32, border: 'none', background: 'transparent',
    color: 'inherit', fontSize: 22, lineHeight: 1, cursor: 'pointer', borderRadius: 6,
  },
};

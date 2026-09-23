import { euro } from '../utils/formato';

interface TotaliFiltriProps {
  /** Quante righe soddisfano i filtri, non quante ne sono caricate. */
  numero: number;
  singolare: string;
  plurale: string;
  /** Importo complessivo delle righe filtrate, calcolato dal backend. */
  importo: number;
}

/**
 * Numero e importo complessivo del risultato filtrato, all'estremo destro
 * della riga dei filtri. aria-live perché cambiano a ogni filtro, e un lettore
 * di schermo deve poterlo annunciare.
 */
export default function TotaliFiltri({ numero, singolare, plurale, importo }: TotaliFiltriProps) {
  return (
    <div style={styles.totali} aria-live='polite'>
      <span style={styles.voce}>
        <strong>{numero}</strong> {numero === 1 ? singolare : plurale}
      </span>
      <span style={styles.importo}>{euro(importo)}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // marginLeft auto: spinge i totali all'estremo destro della riga dei filtri.
  // Quando la riga va a capo su schermi stretti finiscono su una riga propria,
  // sempre allineati a destra.
  totali: {
    marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 16,
    padding: '8px 16px', borderRadius: 8, background: '#fff',
    boxShadow: '0 1px 6px rgba(0,0,0,0.06)', fontSize: 14, color: '#555',
    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
  },
  voce: { color: '#555' },
  importo: { fontSize: 16, fontWeight: 700, color: '#222' },
};

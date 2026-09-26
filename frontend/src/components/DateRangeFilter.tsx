/* eslint-disable react-refresh/only-export-components --
 * Oltre al componente, il file esporta le due funzioni che ne definiscono la
 * semantica (isInDateRange, dataCompleta): stanno qui perché chi usa il filtro
 * usa anche quelle, e tenerle accanto è ciò che rende evidente che descrivono
 * lo stesso intervallo. Costo: in sviluppo l'hot reload ricarica il modulo
 * intero invece del solo componente.
 */
import { theme } from '../theme';
import { dataIso } from '../utils/formato';

interface DateRangeFilterProps {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}

/**
 * Filtro "dal / al" su date di calendario, condiviso da IncontriPage e
 * ResocontoPage.
 *
 * I due campi si limitano a vicenda (max sul primo, min sul secondo): il
 * selettore nativo impedisce così di comporre un intervallo rovesciato, che
 * altrimenti svuoterebbe la tabella senza spiegare perché.
 */
export default function DateRangeFilter({ from, to, onFromChange, onToChange }: DateRangeFilterProps) {
  const attivo = !!(from || to);

  return (
    <div style={styles.wrapper}>
      <label style={styles.group}>
        <span style={styles.label}>Dal</span>
        <input
          type='date'
          style={styles.input}
          value={from}
          max={to || undefined}
          onChange={e => onFromChange(e.target.value)}
        />
      </label>
      <label style={styles.group}>
        <span style={styles.label}>Al</span>
        <input
          type='date'
          style={styles.input}
          value={to}
          min={from || undefined}
          onChange={e => onToChange(e.target.value)}
        />
      </label>
      {/* Visibile solo a filtro attivo: un bottone sempre presente ma inerte
          suggerirebbe che ci sia qualcosa da azzerare anche quando non c'è. */}
      {attivo && (
        <button
          type='button'
          style={styles.reset}
          onClick={() => { onFromChange(''); onToChange(''); }}
        >
          Azzera date
        </button>
      )}
    </div>
  );
}

/**
 * True se `data` (stringa "YYYY-MM-DD") cade nell'intervallo, con estremi
 * inclusi; un estremo vuoto significa "illimitato da quel lato".
 *
 * Il confronto è fra stringhe e non fra Date: nel formato ISO l'ordine
 * lessicografico coincide con quello cronologico, e costruire un oggetto Date
 * reintrodurrebbe la conversione di fuso che fa scivolare le date di un giorno
 * (lo stesso motivo per cui le colonne a db sono DATE).
 */
export function isInDateRange(data: string, from: string, to: string): boolean {
  const giorno = dataIso(data);
  if (from && giorno < from) return false;
  if (to && giorno > to) return false;
  return true;
}

/**
 * La data da passare al backend, o undefined finché non è completa. Mentre si
 * digita l'anno il campo produce date valide ma assurde ("0002-09-15", poi
 * "0020-09-15"...): interrogare il database a ogni cifra svuoterebbe la tabella
 * per un attimo a ogni tasto.
 */
export function dataCompleta(valore: string): string | undefined {
  return /^[1-9]\d{3}-\d{2}-\d{2}$/.test(valore) ? valore : undefined;
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  group: { display: 'flex', alignItems: 'center', gap: 6 },
  label: { fontSize: 13, color: '#555', fontWeight: 500 },
  input: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 14,
    minHeight: 40,
    boxSizing: 'border-box',
    background: '#fff',
    color: '#333',
  },
  reset: {
    background: 'transparent',
    border: 'none',
    color: theme.primary,
    padding: '8px 4px',
    minHeight: 40,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
};

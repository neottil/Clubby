import { useEffect, useRef, useState } from 'react';

/**
 * Select con ricerca testuale: un input che filtra le opzioni mentre si
 * digita, al posto della <select> nativa (illeggibile appena le opzioni sono
 * più di una decina, e su mobile apre il picker di sistema).
 *
 * Componente generico e senza dominio: sa solo estrarre da ogni opzione il
 * valore (quello che finisce in `value`/`onChange`) e l'etichetta (quella
 * mostrata a video e su cui filtra). I wrapper di dominio — SocioSelect,
 * ActivitySelect — lo configurano e restano il punto in cui vivono etichette
 * e regole specifiche.
 */

interface SearchSelectProps<T> {
  options: T[];
  /** Valore attualmente selezionato (stringa vuota = nessuna selezione). */
  value: string;
  onChange: (value: string) => void;
  /** Valore memorizzato per l'opzione: quello passato a onChange e confrontato con `value`. */
  getValue: (option: T) => string;
  /** Etichetta mostrata a video e usata per il filtro testuale. */
  getLabel: (option: T) => string;
  placeholder?: string;
  /** Messaggio quando la ricerca non produce risultati. */
  emptyLabel?: string;
  /**
   * Se impostata, aggiunge in cima un'opzione che riporta la selezione a
   * stringa vuota, con questa etichetta (es. "Tutte le attività"). Serve nei
   * filtri, dove "nessuna selezione" è a sua volta una scelta valida e deve
   * restare raggiungibile dopo aver scelto un valore.
   */
  resetLabel?: string;
}

export default function SearchSelect<T>({
  options,
  value,
  onChange,
  getValue,
  getLabel,
  placeholder,
  emptyLabel,
  resetLabel,
}: SearchSelectProps<T>) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Normalizza opzioni ed eventuale reset in un'unica lista {value, label}:
  // da qui in giù filtro, rendering e selezione non devono più distinguerli.
  const entries: Array<{ value: string; label: string }> = [
    ...(resetLabel !== undefined ? [{ value: '', label: resetLabel }] : []),
    ...options.map(o => ({ value: getValue(o), label: getLabel(o) })),
  ];

  const selected = entries.find(e => e.value === value) ?? null;

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = entries.filter(e =>
    e.label.toLowerCase().includes(query.toLowerCase())
  );

  // Aperto mostra ciò che si sta digitando, chiuso l'etichetta selezionata.
  const displayValue = open ? query : selected?.label ?? '';

  const select = (entryValue: string) => {
    onChange(entryValue);
    setQuery('');
    setOpen(false);
  };

  const apri = () => { setOpen(true); setQuery(''); };

  return (
    <div style={styles.wrapper} ref={wrapperRef}>
      <input
        style={styles.input}
        value={displayValue}
        placeholder={placeholder ?? 'Cerca...'}
        role='combobox'
        aria-expanded={open}
        aria-autocomplete='list'
        onFocus={apri}
        // Anche su click, non solo su focus: dopo una selezione l'input resta
        // focalizzato, quindi un secondo click non rifarebbe scattare onFocus
        // e il campo sembrerebbe bloccato sul valore già scelto.
        onClick={() => { if (!open) apri(); }}
        onChange={e => setQuery(e.target.value)}
      />
      {open && (
        <div style={styles.dropdown} role='listbox'>
          {filtered.length === 0 && (
            <div style={styles.empty}>{emptyLabel ?? 'Nessun risultato'}</div>
          )}
          {filtered.map(e => (
            <div
              key={e.value}
              role='option'
              aria-selected={e.value === value}
              style={{ ...styles.option, ...(e.value === value ? styles.optionSelected : {}) }}
              // onMouseDown e non onClick: il blur dell'input (che chiude il
              // dropdown) arriverebbe prima del click, annullando la scelta.
              onMouseDown={() => select(e.value)}
            >
              {e.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { position: 'relative' },
  input: {
    width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd',
    fontSize: 14, boxSizing: 'border-box',
  },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
    background: '#fff', border: '1px solid #ddd', borderRadius: 6,
    maxHeight: 220, overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  option: { padding: '8px 12px', fontSize: 14, cursor: 'pointer' },
  optionSelected: { background: '#eff6ff', fontWeight: 600 },
  empty: { padding: '8px 12px', fontSize: 13, color: '#999' },
};

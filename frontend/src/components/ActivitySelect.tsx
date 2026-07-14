import { useEffect, useRef, useState } from 'react';

interface ActivitySelectProps {
  options: string[];
  value: string;
  onChange: (attivita: string) => void;
  placeholder?: string;
}

export default function ActivitySelect({ options, value, onChange, placeholder }: ActivitySelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()));

  const displayValue = open ? query : value || '';

  const select = (o: string) => {
    onChange(o);
    setQuery('');
    setOpen(false);
  };

  return (
    <div style={styles.wrapper} ref={wrapperRef}>
      <input
        style={styles.input}
        value={displayValue}
        placeholder={placeholder ?? 'Cerca attività...'}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={e => setQuery(e.target.value)}
      />
      {open && (
        <div style={styles.dropdown}>
          {filtered.length === 0 && <div style={styles.empty}>Nessuna attività trovata</div>}
          {filtered.map(o => (
            <div
              key={o}
              style={{ ...styles.option, ...(o === value ? styles.optionSelected : {}) }}
              onMouseDown={() => select(o)}
            >
              {o}
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

import { useEffect, useRef, useState } from 'react';

interface Socio {
  id: string;
  nome: string;
  cognome: string;
}

interface SocioSelectProps {
  soci: Socio[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

export default function SocioSelect({ soci, value, onChange, placeholder }: SocioSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = soci.find(s => s.id === value) ?? null;

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

  const filtered = soci.filter(s =>
    `${s.cognome} ${s.nome}`.toLowerCase().includes(query.toLowerCase())
  );

  const displayValue = open ? query : selected ? `${selected.cognome} ${selected.nome}` : '';

  const select = (s: Socio) => {
    onChange(s.id);
    setQuery('');
    setOpen(false);
  };

  return (
    <div style={styles.wrapper} ref={wrapperRef}>
      <input
        style={styles.input}
        value={displayValue}
        placeholder={placeholder ?? 'Cerca per cognome o nome...'}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={e => setQuery(e.target.value)}
      />
      {open && (
        <div style={styles.dropdown}>
          {filtered.length === 0 && <div style={styles.empty}>Nessun socio trovato</div>}
          {filtered.map(s => (
            <div
              key={s.id}
              style={{ ...styles.option, ...(s.id === value ? styles.optionSelected : {}) }}
              onMouseDown={() => select(s)}
            >
              {s.cognome} {s.nome}
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

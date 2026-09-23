import SearchSelect from './SearchSelect';

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
  /** Etichetta dell'opzione "nessun filtro" (vedi SearchSelect.resetLabel). */
  resetLabel?: string;
}

/** Select con ricerca per la scelta di un socio (vedi SearchSelect). */
export default function SocioSelect({ soci, value, onChange, placeholder, resetLabel }: SocioSelectProps) {
  return (
    <SearchSelect
      options={soci}
      value={value}
      onChange={onChange}
      getValue={s => s.id}
      getLabel={s => `${s.nome} ${s.cognome}`}
      placeholder={placeholder ?? 'Cerca per nome o cognome...'}
      emptyLabel='Nessun socio trovato'
      resetLabel={resetLabel}
    />
  );
}

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
}

/** Select con ricerca per la scelta di un socio (vedi SearchSelect). */
export default function SocioSelect({ soci, value, onChange, placeholder }: SocioSelectProps) {
  return (
    <SearchSelect
      options={soci}
      value={value}
      onChange={onChange}
      getValue={s => s.id}
      getLabel={s => `${s.cognome} ${s.nome}`}
      placeholder={placeholder ?? 'Cerca per cognome o nome...'}
      emptyLabel='Nessun socio trovato'
    />
  );
}

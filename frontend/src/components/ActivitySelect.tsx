import SearchSelect from './SearchSelect';
import type { Attivita } from '../api/client';

interface ActivitySelectProps {
  options: Attivita[];
  /** Id dell'attività scelta, stringa vuota per "nessuna". */
  value: string;
  onChange: (attivitaId: string) => void;
  placeholder?: string;
  /** Etichetta dell'opzione "nessun filtro" (vedi SearchSelect.resetLabel). */
  resetLabel?: string;
}

/** Select con ricerca per la scelta di un'attività di listino (vedi SearchSelect). */
export default function ActivitySelect({ options, value, onChange, placeholder, resetLabel }: ActivitySelectProps) {
  return (
    <SearchSelect
      options={options}
      value={value}
      onChange={onChange}
      getValue={a => a.id}
      getLabel={a => a.nome}
      placeholder={placeholder ?? 'Cerca attività...'}
      emptyLabel='Nessuna attività trovata'
      resetLabel={resetLabel}
    />
  );
}

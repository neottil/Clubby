import SearchSelect from './SearchSelect';

interface ActivitySelectProps {
  options: string[];
  value: string;
  onChange: (attivita: string) => void;
  placeholder?: string;
  /** Etichetta dell'opzione "nessun filtro" (vedi SearchSelect.resetLabel). */
  resetLabel?: string;
}

/** Select con ricerca per la scelta di un'attività (vedi SearchSelect). */
export default function ActivitySelect({ options, value, onChange, placeholder, resetLabel }: ActivitySelectProps) {
  // Un incontro già salvato può avere un'attività non più presente nel
  // mapping da configurazione (VITE_ACTIVITY_SELECT_VALUES_MAPPING cambiato
  // dopo il salvataggio): senza questo innesto il campo apparirebbe vuoto in
  // modifica, come se l'attività non fosse impostata.
  const allOptions = value && !options.includes(value) ? [value, ...options] : options;

  return (
    <SearchSelect
      options={allOptions}
      value={value}
      onChange={onChange}
      getValue={o => o}
      getLabel={o => o}
      placeholder={placeholder ?? 'Cerca attività...'}
      emptyLabel='Nessuna attività trovata'
      resetLabel={resetLabel}
    />
  );
}

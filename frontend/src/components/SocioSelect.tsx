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
      // Cognome prima del nome, come ovunque nell'applicazione (elenchi,
      // tabelle, ricevute): in un elenco di persone è il cognome che si cerca
      // con l'occhio. La ricerca non ne risente, perché confronta le parole
      // una per una e senza badare all'ordine.
      getLabel={s => `${s.cognome} ${s.nome}`}
      placeholder={placeholder ?? 'Cerca per cognome o nome...'}
      emptyLabel='Nessun socio trovato'
      resetLabel={resetLabel}
    />
  );
}

import { ui } from '../styles/ui';

interface IntestazioneOrdinabileProps {
  etichetta: string;
  /** Direzione se la tabella è ordinata su questa colonna, altrimenti null. */
  direzione: 'asc' | 'desc' | null;
  onOrdina: () => void;
  /** Ritocchi locali, es. padding ridotto su mobile. */
  style?: React.CSSProperties;
}

/**
 * Intestazione di colonna che ordina la tabella al click.
 *
 * Il click sta su un <button> e non sulla cella: così si raggiunge e si attiva
 * anche da tastiera. aria-sort dice a un lettore di schermo come è ordinata la
 * colonna, cosa che la sola freccia non comunica.
 */
export default function IntestazioneOrdinabile({ etichetta, direzione, onOrdina, style }: IntestazioneOrdinabileProps) {
  const ariaSort = direzione === 'asc' ? 'ascending' : direzione === 'desc' ? 'descending' : 'none';
  return (
    <th style={{ ...ui.th, ...style }} aria-sort={ariaSort}>
      <button type='button' style={bottone} onClick={onOrdina}>
        {etichetta}
        {direzione && <span aria-hidden='true'>{direzione === 'asc' ? ' ▲' : ' ▼'}</span>}
      </button>
    </th>
  );
}

// Il pulsante eredita l'aspetto dell'intestazione: deve sembrarne il testo.
const bottone: React.CSSProperties = {
  background: 'transparent', border: 'none', padding: 0, margin: 0,
  font: 'inherit', color: 'inherit', fontWeight: 'inherit', textAlign: 'inherit',
  cursor: 'pointer', userSelect: 'none',
};

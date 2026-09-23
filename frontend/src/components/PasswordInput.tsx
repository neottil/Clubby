/**
 * Campo password con il bottone per mostrarne il contenuto.
 *
 * Estratto perché le schermate che chiedono una password sono più di una
 * (accesso, registrazione, cambio obbligatorio): con l'occhiolino su una sola
 * di esse, le altre sembrerebbero campi di tipo diverso.
 */

import { useState } from 'react';

interface PasswordInputProps {
  value: string;
  onChange: (valore: string) => void;
  /** Vedi l'attributo autocomplete: 'new-password' o 'current-password'. */
  autoComplete: 'new-password' | 'current-password';
  style?: React.CSSProperties;
  id?: string;
}

export default function PasswordInput({ value, onChange, autoComplete, style, id }: PasswordInputProps) {
  const [mostra, setMostra] = useState(false);
  const etichetta = mostra ? 'Nascondi la password' : 'Mostra la password';

  return (
    // Il bottone è posizionato dentro il campo, quindi l'input ha spazio a
    // destra per non finirci sotto col testo.
    <span style={styles.contenitore}>
      <input
        id={id}
        style={{ ...styles.input, ...style, paddingRight: 44 }}
        type={mostra ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
      />
      {/* type='button': dentro un <form> il default sarebbe 'submit', e
          mostrare la password invierebbe il modulo. */}
      <button
        type='button'
        style={styles.occhio}
        onClick={() => setMostra(v => !v)}
        aria-label={etichetta}
        aria-pressed={mostra}
        title={etichetta}
      >
        <IconaOcchio barrato={mostra} />
      </button>
    </span>
  );
}

/**
 * Occhio aperto o barrato. Disegnato inline invece di aggiungere una libreria
 * di icone per un solo simbolo, e con `currentColor` così segue il colore del
 * bottone che lo contiene.
 */
function IconaOcchio({ barrato }: { barrato: boolean }) {
  return (
    <svg
      width='18' height='18' viewBox='0 0 24 24' fill='none'
      stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'
      // L'etichetta è già sul bottone: ripeterla qui la farebbe annunciare due
      // volte da un lettore di schermo.
      aria-hidden='true' focusable='false'
    >
      <path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' />
      <circle cx='12' cy='12' r='3' />
      {barrato && <line x1='3' y1='3' x2='21' y2='21' />}
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  contenitore: { display: 'block', position: 'relative' },
  input: {
    display: 'block', width: '100%', marginTop: 4, padding: '10px 12px',
    borderRadius: 6, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box',
  },
  occhio: {
    position: 'absolute', right: 4, top: 4,
    // 36px: sotto i 44 raccomandati per un bersaglio tattile, ma il campo è
    // alto 41 e un bottone più grande ne uscirebbe.
    width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', borderRadius: 6,
    color: '#777', cursor: 'pointer', padding: 0,
  },
};

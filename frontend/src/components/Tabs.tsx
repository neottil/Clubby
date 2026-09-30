import { useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { theme } from '../theme';

export interface Scheda {
  /** Identificativo stabile: è ciò che il chiamante riceve e memorizza. */
  id: string;
  etichetta: string;
  contenuto: ReactNode;
}

interface TabsProps {
  schede: Scheda[];
  attiva: string;
  onCambia: (id: string) => void;
}

/**
 * Schede con navigazione da tastiera, sul modello ARIA "tabs".
 *
 * Lo stato sta nel chiamante e non qui: la pagina deve poter sapere quale
 * scheda è aperta per decidere quali dati caricare, e ricordarselo fra un
 * caricamento e l'altro.
 *
 * Il contenuto delle schede non attive **non viene montato**. È la differenza
 * con CardCollassabile, che invece resta montata da chiusa per non perdere un
 * campo a metà: qui le schede sono elenchi caricati dal server, e tenerli vivi
 * tutti significherebbe interrogare il backend per pagine che nessuno guarda.
 * Lo stato che deve sopravvivere al cambio di scheda (i filtri, la selezione)
 * vive infatti sopra questo componente.
 */
export default function Tabs({ schede, attiva, onCambia }: TabsProps) {
  const prefisso = useId();
  const riferimenti = useRef<Record<string, HTMLButtonElement | null>>({});

  const idScheda = (id: string) => `${prefisso}-tab-${id}`;
  const idPannello = (id: string) => `${prefisso}-panel-${id}`;

  // Frecce, Home e Fine: è ciò che distingue un gruppo di schede vero da tre
  // pulsanti messi in fila, per chi naviga da tastiera o con uno screen reader.
  const daTastiera = (e: React.KeyboardEvent, indice: number) => {
    const ultimo = schede.length - 1;
    let prossimo: number | null = null;
    if (e.key === 'ArrowRight') prossimo = indice === ultimo ? 0 : indice + 1;
    else if (e.key === 'ArrowLeft') prossimo = indice === 0 ? ultimo : indice - 1;
    else if (e.key === 'Home') prossimo = 0;
    else if (e.key === 'End') prossimo = ultimo;
    if (prossimo === null) return;

    e.preventDefault();
    const id = schede[prossimo].id;
    onCambia(id);
    riferimenti.current[id]?.focus();
  };

  const corrente = schede.find(s => s.id === attiva) ?? schede[0];

  return (
    <>
      <div role='tablist' style={styles.barra}>
        {schede.map((scheda, indice) => {
          const selezionata = scheda.id === corrente.id;
          return (
            <button
              key={scheda.id}
              ref={el => { riferimenti.current[scheda.id] = el; }}
              type='button'
              role='tab'
              id={idScheda(scheda.id)}
              aria-selected={selezionata}
              aria-controls={idPannello(scheda.id)}
              // Un solo punto di ingresso col Tab: dentro il gruppo ci si
              // sposta con le frecce, non tabulando scheda per scheda.
              tabIndex={selezionata ? 0 : -1}
              onClick={() => onCambia(scheda.id)}
              onKeyDown={e => daTastiera(e, indice)}
              style={{ ...styles.scheda, ...(selezionata ? styles.schedaAttiva : {}) }}
            >
              {scheda.etichetta}
            </button>
          );
        })}
      </div>
      <div
        role='tabpanel'
        id={idPannello(corrente.id)}
        aria-labelledby={idScheda(corrente.id)}
        tabIndex={0}
        style={styles.pannello}
      >
        {corrente.contenuto}
      </div>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  barra: {
    display: 'flex', gap: 4, borderBottom: '2px solid #e5e7eb',
    marginBottom: 16, overflowX: 'auto',
  },
  scheda: {
    padding: '10px 18px', minHeight: 44, border: 'none', background: 'transparent',
    font: 'inherit', fontSize: 15, color: '#666', cursor: 'pointer',
    // Il bordo c'è sempre, trasparente da inattiva: senza, la scheda
    // selezionata si sposterebbe di due pixel a ogni cambio.
    borderBottom: '3px solid transparent', marginBottom: -2, whiteSpace: 'nowrap',
  },
  schedaAttiva: {
    color: theme.primary, fontWeight: 600, borderBottomColor: theme.primary,
  },
  // outline rimosso solo qui: il pannello riceve il focus da programma dopo il
  // cambio di scheda, e un alone attorno a mezza pagina confonderebbe.
  pannello: { outline: 'none' },
};

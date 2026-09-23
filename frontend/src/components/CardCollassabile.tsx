import { useId, useState } from 'react';

interface CardCollassabileProps {
  titolo: string;
  /**
   * Breve riepilogo accanto al titolo, visibile anche a card chiusa: dice cosa
   * c'è dentro senza doverla aprire (es. "2 da collegare").
   */
  riepilogo?: string;
  /** Evidenzia il riepilogo: dentro c'è qualcosa che chiede un intervento. */
  attenzione?: boolean;
  apertaDiDefault?: boolean;
  children: React.ReactNode;
}

/**
 * Card con intestazione cliccabile che ne mostra o nasconde il contenuto.
 *
 * Il contenuto resta montato anche a card chiusa (attributo hidden): chiuderla
 * non deve buttare via un campo compilato a metà o una riga in modifica.
 */
export default function CardCollassabile({
  titolo, riepilogo, attenzione = false, apertaDiDefault = false, children,
}: CardCollassabileProps) {
  const [aperta, setAperta] = useState(apertaDiDefault);
  const idContenuto = useId();

  return (
    <section style={styles.card}>
      <h3 style={styles.titoloWrapper}>
        <button
          type='button'
          style={styles.intestazione}
          aria-expanded={aperta}
          aria-controls={idContenuto}
          onClick={() => setAperta(a => !a)}
        >
          <span aria-hidden='true' style={{ ...styles.freccia, transform: aperta ? 'rotate(90deg)' : 'none' }}>▶</span>
          <span style={styles.titolo}>{titolo}</span>
          {riepilogo && (
            <span style={{ ...styles.riepilogo, ...(attenzione ? styles.riepilogoAttenzione : {}) }}>
              {riepilogo}
            </span>
          )}
        </button>
      </h3>
      <div id={idContenuto} hidden={!aperta} style={styles.contenuto}>
        {children}
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: '#fff', borderRadius: 12, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' },
  titoloWrapper: { margin: 0 },
  intestazione: {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56,
    padding: '14px 24px', background: 'transparent', border: 'none', cursor: 'pointer',
    textAlign: 'left', font: 'inherit', color: '#222', flexWrap: 'wrap',
  },
  freccia: { fontSize: 11, color: '#888', transition: 'transform 0.15s ease', width: 12, flexShrink: 0 },
  titolo: { fontSize: 16, fontWeight: 700 },
  riepilogo: {
    marginLeft: 'auto', fontSize: 13, fontWeight: 500, color: '#555',
    background: '#f1f5f9', padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap',
  },
  riepilogoAttenzione: { color: '#92400e', background: '#fffbeb' },
  contenuto: { padding: '0 24px 24px' },
};

import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  /** Titolo mostrato in testa alla card. Omesso, l'intestazione non viene resa. */
  title?: string;
  /** Larghezza della card. Il default (360) è quello del dettaglio incontro
   *  nella pagina Voucher; contenuti più larghi (es. una nota Markdown)
   *  possono chiedere di più. */
  width?: number;
  onClose: () => void;
  children: ReactNode;
  /** Contenuto della riga di azioni in fondo (tipicamente i bottoni). */
  footer?: ReactNode;
}

/**
 * Modale generica: overlay scuro, card centrata, chiusura con click fuori o
 * con Esc.
 *
 * La chiusura con Esc è gestita qui e non da chi la usa, perché è la modale a
 * sapere quando è montata: un listener registrato dalla pagina resterebbe
 * attivo anche a modale chiusa e intercetterebbe Esc destinato ad altro.
 */
export default function Modal({ title, width = 360, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    // stopPropagation sulla card: il click sull'overlay chiude, quello sul
    // contenuto no (altrimenti selezionare del testo chiuderebbe la modale).
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={{ ...styles.card, width, maxWidth: 'calc(100vw - 32px)' }}
        onClick={e => e.stopPropagation()}
        role='dialog'
        aria-modal='true'
        aria-label={title}
      >
        {title && <h3 style={styles.title}>{title}</h3>}
        <div style={styles.body}>{children}</div>
        {footer && <div style={styles.actions}>{footer}</div>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    padding: 16, boxSizing: 'border-box',
  },
  card: {
    background: '#fff', borderRadius: 12, padding: 24,
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    // La card non deve mai superare l'altezza della finestra: è il corpo a
    // scrollare, così titolo e azioni restano sempre raggiungibili.
    maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column',
    boxSizing: 'border-box',
  },
  title: { margin: '0 0 16px', fontSize: 16, fontWeight: 700, flexShrink: 0 },
  body: { overflowY: 'auto', minHeight: 0 },
  actions: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16, flexShrink: 0 },
};

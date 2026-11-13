import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { config } from '../config';
import { theme } from '../theme';
import { inAppInstallata, nascondiIstruzioniIos, suSafariIos, useIstruzioniIosRichieste } from '../utils/installazione';

/** Ogni quanto l'app aperta chiede al server se c'è una versione nuova. */
const CONTROLLO_AGGIORNAMENTI_MS = 60 * 60 * 1000;

/** Chiave dell'avviso iOS chiuso: in localStorage, vale per il dispositivo. */
const CHIAVE_AVVISO_IOS = 'clubby_avviso_ios_chiuso';

function avvisoIosChiuso(): boolean {
  try {
    return localStorage.getItem(CHIAVE_AVVISO_IOS) === '1';
  } catch {
    return false;
  }
}

/**
 * Gli avvisi dell'app installabile (spec 012), sopra a qualunque pagina:
 *
 * - **versione nuova**: il service worker l'ha già scaricata, "Aggiorna" la
 *   attiva e ricarica. Non si ricarica da soli: potrebbe succedere a metà di
 *   un form, e il form andrebbe perso;
 * - **offline**: la connessione è caduta mentre l'app era aperta;
 * - **come installare su iPhone**: Safari non ha un pulsante da offrire, si può
 *   solo spiegare dove toccare. Chiuso una volta, non torna da solo: lo riapre
 *   la voce "Installa l'app" del menu (Layout).
 *
 * Montato una volta sola in App.tsx, fuori dalle rotte: è anche il punto in
 * cui si registra il service worker.
 */
export default function AvvisiApp() {
  const { needRefresh: [versioneNuova], updateServiceWorker } = useRegisterSW({
    // Il browser controlla gli aggiornamenti solo quando si naviga, e in
    // un'app a pagina singola non si naviga mai davvero: un'app installata
    // lasciata aperta per giorni non saprebbe di un deploy. Si chiede quindi
    // ogni ora, e ogni volta che l'app torna in primo piano.
    onRegisteredSW(_url, registrazione) {
      if (!registrazione) return;
      const controlla = () => { void registrazione.update().catch(() => {}); };
      window.setInterval(controlla, CONTROLLO_AGGIORNAMENTI_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') controlla();
      });
    },
  });

  /**
   * Attiva la versione nuova e ricarica la pagina appena il nuovo service
   * worker ne prende il controllo. La ricarica la fa già updateServiceWorker,
   * ma solo per gli aggiornamenti che workbox-window ha visto nascere: quelli
   * trovati dal controllo periodico qui sopra (registrazione.update()) li
   * considera "esterni" e non ricaricherebbe, lasciando la pagina sulla
   * versione vecchia dopo il tocco su "Aggiorna".
   */
  const aggiorna = () => {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    void updateServiceWorker(true);
  };

  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const aggiorna = () => setOnline(navigator.onLine);
    window.addEventListener('online', aggiorna);
    window.addEventListener('offline', aggiorna);
    return () => {
      window.removeEventListener('online', aggiorna);
      window.removeEventListener('offline', aggiorna);
    };
  }, []);

  const [mostraIosDaSolo, setMostraIosDaSolo] = useState(() => suSafariIos() && !inAppInstallata() && !avvisoIosChiuso());
  const richiestoDalMenu = useIstruzioniIosRichieste();
  const mostraIos = mostraIosDaSolo || richiestoDalMenu;
  const chiudiIos = () => {
    setMostraIosDaSolo(false);
    nascondiIstruzioniIos();
    try {
      localStorage.setItem(CHIAVE_AVVISO_IOS, '1');
    } catch {
      // Navigazione privata: l'avviso tornerà alla prossima apertura, pazienza.
    }
  };

  return (
    <>
      {(versioneNuova || !online) && (
        <div style={styles.barraAlta}>
          {versioneNuova && (
            <div role='status' style={{ ...styles.barra, ...styles.barraAggiornamento }}>
              <span style={styles.testo}>È disponibile una nuova versione.</span>
              <button type='button' style={styles.bottoneAggiorna} onClick={aggiorna}>
                Aggiorna
              </button>
            </div>
          )}
          {!online && (
            <div role='status' style={{ ...styles.barra, ...styles.barraOffline }}>
              <span style={styles.testo}>Sei offline: finché non torna la connessione i dati non si aggiornano e le modifiche non si salvano.</span>
            </div>
          )}
        </div>
      )}

      {mostraIos && (
        <div role='region' aria-label="Installa l'app" style={styles.avvisoIos}>
          <div style={styles.testoIos}>
            <strong>Usa {config.tenantName} come un'app</strong>
            <span>
              Tocca <IconaCondividi /> <strong>Condividi</strong> nella barra di Safari (o nel menu{' '}
              <strong>···</strong>), poi <strong>Aggiungi alla schermata Home</strong>.
            </span>
          </div>
          <button type='button' style={styles.chiudi} onClick={chiudiIos} aria-label="Chiudi l'avviso">
            ×
          </button>
        </div>
      )}
    </>
  );
}

/** L'icona di Condividi di Safari: un quadrato con una freccia verso l'alto. */
function IconaCondividi() {
  return (
    <svg width='16' height='18' viewBox='0 0 16 18' aria-hidden='true' style={{ verticalAlign: '-3px' }}>
      <path d='M8 1v11M4.5 4.5 8 1l3.5 3.5' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' />
      <path d='M5 7H2.5v10h11V7H11' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinejoin='round' />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // Sopra la barra di navigazione, che non è fissa: la barra resta visibile
  // anche scorrendo una tabella lunga. Sotto la barra di stato dell'iPhone
  // nell'app installata (vedi index.css), altrove l'inset vale zero.
  barraAlta: {
    position: 'sticky', top: 'env(safe-area-inset-top)', zIndex: 200,
    display: 'flex', flexDirection: 'column',
  },
  barra: {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    padding: '8px 16px', fontSize: 14, lineHeight: 1.4,
  },
  barraAggiornamento: { background: '#eff6ff', color: '#1e3a8a', borderBottom: '1px solid #bfdbfe' },
  barraOffline: { background: '#fff7ed', color: '#9a3412', borderBottom: '1px solid #fed7aa' },
  testo: { flex: 1, minWidth: 180 },
  bottoneAggiorna: {
    background: theme.primary, color: theme.primaryText, border: 'none', borderRadius: 6,
    padding: '8px 16px', minHeight: 40, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  avvisoIos: {
    position: 'fixed', zIndex: 200,
    left: 12, right: 12,
    // Sopra l'indicatore Home dell'iPhone e la barra degli strumenti di Safari.
    bottom: 'calc(12px + env(safe-area-inset-bottom))',
    display: 'flex', alignItems: 'flex-start', gap: 8,
    background: '#fff', color: '#1a1a2e', borderRadius: 12,
    boxShadow: '0 8px 28px rgba(0,0,0,0.25)', padding: '12px 8px 12px 16px',
    fontSize: 14, lineHeight: 1.5,
  },
  testoIos: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  chiudi: {
    flexShrink: 0, width: 32, height: 32, border: 'none', background: 'transparent',
    color: 'inherit', fontSize: 22, lineHeight: 1, cursor: 'pointer', borderRadius: 6,
  },
};

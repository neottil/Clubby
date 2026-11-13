import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { caricaConfig, config, ErroreRete, iconaApple } from './config';
import { ascoltaInstallazione } from './utils/installazione';

const root = createRoot(document.getElementById('root')!);

// Prima di tutto il resto: il browser può proporre l'installazione (evento
// beforeinstallprompt) mentre la configurazione è ancora in arrivo, e un
// evento perso non si ripete fino alla prossima apertura.
ascoltaInstallazione();

/** Imposta l'attributo di un elemento di <head>, se c'è. */
function impostaHead(selettore: string, attributo: string, valore: string) {
  document.querySelector(selettore)?.setAttribute(attributo, valore);
}

/**
 * Avvio in due tempi: prima la configurazione del club (/config.json), poi
 * l'applicazione.
 *
 * App è importata dinamicamente di proposito: tema e stili comuni calcolano i
 * colori quando il loro modulo viene valutato, e con un import statico questo
 * avverrebbe prima di aver letto la configurazione.
 */
async function avvia() {
  try {
    await caricaConfig();
  } catch (e) {
    // Senza rete l'app installata si apre lo stesso (dal service worker), ma
    // la configurazione arriva solo dal server: lo si dice per quello che è,
    // con un modo di riprovare senza dover chiudere l'app.
    if (e instanceof ErroreRete) {
      root.render(
        <div style={{ padding: 48, textAlign: 'center', fontFamily: 'system-ui, sans-serif', color: '#374151' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>Sei offline</h1>
          <p style={{ margin: '0 0 20px' }}>Per usare l'app serve la connessione. Controlla la rete e riprova.</p>
          <button
            type='button'
            onClick={() => window.location.reload()}
            style={{ padding: '12px 24px', minHeight: 44, fontSize: 15, borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
          >
            Riprova
          </button>
        </div>
      );
      return;
    }
    // Nessun tema qui: senza configurazione non ci sono colori del club, e
    // theme.ts non va nemmeno caricato.
    root.render(
      <div style={{ padding: 48, textAlign: 'center', fontFamily: 'system-ui, sans-serif', color: '#991b1b' }}>
        <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>Applicazione non configurata</h1>
        <p style={{ margin: 0 }}>{(e as Error).message}</p>
      </div>
    );
    return;
  }

  document.title = config.tenantName;
  impostaHead('link[rel="icon"]', 'href', config.logo);
  // Nome e icona che iOS usa per l'app aggiunta alla Home (spec 012): li legge
  // al momento di "Aggiungi alla schermata Home", quindi basta impostarli qui.
  impostaHead('meta[name="apple-mobile-web-app-title"]', 'content', config.tenantName);
  impostaHead('link[rel="apple-touch-icon"]', 'href', iconaApple(config.logo));

  // Il colore della barra di navigazione del club anche per la barra del
  // browser (Android) e, nell'app installata su iPhone, dietro la barra di
  // stato (vedi index.css).
  const { theme } = await import('./theme');
  impostaHead('meta[name="theme-color"]', 'content', theme.navBg);
  document.documentElement.style.backgroundColor = theme.navBg;

  const { default: App } = await import('./App.tsx');
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void avvia();

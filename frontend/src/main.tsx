import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { caricaConfig, config } from './config';

const root = createRoot(document.getElementById('root')!);

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
  document.querySelector('link[rel="icon"]')?.setAttribute('href', config.logo);

  const { default: App } = await import('./App.tsx');
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void avvia();

/**
 * Stili comuni a tutte le pagine: pulsanti, campi dei form, tabelle.
 *
 * Ogni pagina li include in testa al proprio oggetto di stili
 * (`const styles = { ...ui, ... }`) e ridefinisce solo ciò che le è proprio:
 * così un ritocco a un pulsante vale ovunque, invece di andare ripetuto in
 * sette file che col tempo divergono.
 */

import type { CSSProperties } from 'react';
import { theme } from '../theme';

/**
 * Aspetto della <select>. La freccia di sistema è attaccata al bordo, cambia
 * da browser a browser e non è distanziabile in alcun modo: `appearance: none`
 * la toglie e la ridisegniamo come immagine di sfondo, staccata dal bordo
 * quanto il testo lo è dall'altro lato. Il padding destro di 36px tiene le
 * opzioni lunghe lontane dalla freccia.
 */
const frecciaSelect =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5 11 1.5' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";

const selectBase: CSSProperties = {
  padding: '8px 36px 8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14,
  minHeight: 40, boxSizing: 'border-box', backgroundColor: '#fff',
  backgroundImage: frecciaSelect, backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center', backgroundSize: '12px 8px',
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
};

export const ui = {
  page: { padding: 32 },
  loading: { padding: 48, textAlign: 'center', color: '#666' },

  // Pulsanti. minHeight 40: bersaglio tattile adeguato anche su mobile.
  btn: { background: theme.primary, color: theme.primaryText, border: 'none', borderRadius: 8, padding: '8px 20px', minHeight: 40, cursor: 'pointer', fontWeight: 600 },
  btnSecondary: { background: '#e5e7eb', color: '#333', border: 'none', borderRadius: 8, padding: '8px 20px', minHeight: 40, cursor: 'pointer', fontWeight: 600 },
  btnSmall: { background: '#e5e7eb', border: 'none', borderRadius: 6, padding: '8px 14px', minHeight: 40, cursor: 'pointer', fontSize: 13, marginRight: 6 },
  btnDanger: { background: '#fee', color: theme.danger },

  // Form
  formCard: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 500 },
  input: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  // `select` per i menu affiancati ad altro (filtri, celle di tabella), che si
  // dimensionano sul contenuto; `selectPieno` per i campi di un form, che
  // occupano la riga come gli input.
  select: selectBase,
  selectPieno: { ...selectBase, width: '100%' },
  textarea: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, minHeight: 80, boxSizing: 'border-box' },
  formActions: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 },

  // Riga dei filtri sopra un elenco
  filterRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  filterInput: { flex: 1, minWidth: 240, padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },

  // Tabelle
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  th: { padding: '12px 16px', textAlign: 'left', background: '#f1f5f9', fontSize: 13, fontWeight: 600, color: '#555', borderBottom: '1px solid #e5e7eb' },
  tr: { borderBottom: '1px solid #f1f5f9' },
  td: { padding: '11px 16px', fontSize: 14, color: '#333' },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
} satisfies Record<string, CSSProperties>;

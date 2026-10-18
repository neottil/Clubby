/**
 * Riquadro dell'incontro di gruppo (spec 010): i dati comuni in testa, una chip
 * per socio con la sua nota, e il pulsante che crea gli incontri.
 *
 * Solo presentazione: il gruppo lo compone e lo salva ElencoIncontri, che ha già
 * il form, i saldi e il client. Qui niente chiamate e niente stato proprio.
 */

import Avviso from './Avviso';
import { MarkdownView } from './MarkdownEditor';
import { ui } from '../styles/ui';

/** Un socio del gruppo, con la nota che finirà sul suo incontro. */
export interface MembroGruppo {
  socio_id: string;
  note: string;
  note_markdown: boolean;
  /** Errore dell'ultimo tentativo di salvataggio, se questo socio è fallito. */
  errore?: string;
}

interface RiquadroGruppoProps {
  /** Riga di testa coi dati comuni ("18/10/2026 · Educazione · € 30,00"); assente a gruppo vuoto. */
  riepilogo: string | null;
  /** Nome dell'istruttore, se l'incontro ne ha uno. */
  istruttore: string | null;
  membri: MembroGruppo[];
  nomeSocio: (socioId: string) => string;
  onRimuovi: (socioId: string) => void;
  onSalva: () => void;
  /** Testo del pulsante durante il salvataggio ("Salvataggio 2 di 3..."); null quando fermo. */
  avanzamento: string | null;
  esito: string;
  onChiudiEsito: () => void;
}

export default function RiquadroGruppo({
  riepilogo, istruttore, membri, nomeSocio, onRimuovi, onSalva, avanzamento, esito, onChiudiEsito,
}: RiquadroGruppoProps) {
  const quanti = membri.length;
  const inCorso = avanzamento !== null;

  return (
    <section style={styles.riquadro} aria-label={"Soci dell'incontro di gruppo"}>
      <h3 style={styles.formTitle}>Gruppo</h3>
      {esito && <Avviso tipo='errore' messaggio={esito} onChiudi={onChiudiEsito} />}

      {riepilogo ? (
        <div style={styles.comuni}>
          <div>{riepilogo}</div>
          {istruttore && <div style={styles.istruttore}>Istruttore: {istruttore}</div>}
        </div>
      ) : (
        <p style={styles.vuoto}>
          Compila l'incontro e premi <strong>Aggiungi</strong> per ogni socio: data, attività,
          costo e istruttore valgono per tutti, la nota è di ciascuno.
        </p>
      )}

      {/* Due colonne, socio e note: la stessa griglia su ogni riga, così le note
          restano allineate anche con nomi di lunghezza diversa. */}
      {quanti > 0 && (
        <div style={{ ...styles.riga, ...styles.intestazione }} aria-hidden='true'>
          <span>Socio</span>
          <span>Note</span>
        </div>
      )}
      <ul style={styles.elenco}>
        {membri.map(m => (
          <li key={m.socio_id} style={styles.riga}>
            <div style={styles.colonnaSocio}>
              <span style={styles.chip}>
                {nomeSocio(m.socio_id)}
                <button
                  type='button'
                  style={styles.chipRimuovi}
                  onClick={() => onRimuovi(m.socio_id)}
                  disabled={inCorso}
                  aria-label={`Togli ${nomeSocio(m.socio_id)} dal gruppo`}
                  title='Togli dal gruppo'
                >
                  ×
                </button>
              </span>
              {m.errore && <div style={styles.errore}>{m.errore}</div>}
            </div>
            <div style={styles.nota}>
              {!m.note.trim()
                ? '—'
                : m.note_markdown
                  ? <MarkdownView markdown={m.note} />
                  : <div style={styles.notaTesto}>{m.note}</div>}
            </div>
          </li>
        ))}
      </ul>

      <div style={styles.formActions}>
        <button
          style={{ ...styles.btn, ...(quanti === 0 ? styles.btnDisabilitato : {}) }}
          onClick={onSalva}
          disabled={quanti === 0 || inCorso}
        >
          {avanzamento ?? `Salva gruppo (${quanti} ${quanti === 1 ? 'incontro' : 'incontri'})`}
        </button>
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  ...ui,
  riquadro: { ...ui.formCard, flex: 1, minWidth: 0, marginBottom: 0, width: '100%', boxSizing: 'border-box' },
  formTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 700 },
  comuni: { fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 16 },
  istruttore: { fontWeight: 400, color: '#555', marginTop: 4 },
  vuoto: { fontSize: 13, color: '#666', margin: '0 0 16px', lineHeight: 1.5 },
  elenco: { listStyle: 'none', margin: '0 0 8px', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 },
  riga: { display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)', gap: 16, alignItems: 'start' },
  intestazione: { fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  colonnaSocio: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minWidth: 0 },
  // Allineata al centro della chip (alta 40px), non al suo bordo superiore.
  nota: { fontSize: 13, color: '#555', paddingTop: 10, minWidth: 0, overflowWrap: 'anywhere' },
  notaTesto: { whiteSpace: 'pre-wrap', lineHeight: 1.5 },
  errore: { fontSize: 13, color: '#b91c1c', paddingLeft: 12 },
};

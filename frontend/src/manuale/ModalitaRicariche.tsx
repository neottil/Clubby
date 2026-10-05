import type { ModalitaRicarica } from '../config';

const MODALITA: Array<{ valore: ModalitaRicarica; nome: string; descrizione: string }> = [
  {
    valore: 'free',
    nome: 'Importo libero',
    descrizione: 'Si scrive l\'importo pagato dal socio, e sul voucher viene accreditato esattamente quello.',
  },
  {
    valore: 'percentage',
    nome: 'Percentuale in più',
    descrizione: 'Si scrive l\'importo pagato, e il voucher riceve quell\'importo più una percentuale fissa, '
      + 'impostata nella card Ricariche delle Impostazioni.',
  },
  {
    valore: 'map',
    nome: 'Tagli preconfigurati',
    descrizione: 'Si sceglie un taglio da un elenco (per esempio 50 € pagati → 55 € accreditati). '
      + 'L\'elenco dei tagli si prepara nella card Ricariche delle Impostazioni.',
  },
];

/**
 * Le tre modalità di ricarica, con quella del club evidenziata: l'admin deve
 * sapere che le altre esistono per poterle chiedere, perché non si cambiano
 * dall'applicazione.
 */
export default function ModalitaRicariche({ attiva }: { attiva: ModalitaRicarica }) {
  return (
    <>
      <ul style={stili.modalita}>
        {MODALITA.map(m => (
          <li key={m.valore} style={m.valore === attiva ? { ...stili.voceModalita, ...stili.voceAttiva } : stili.voceModalita}>
            <strong>{m.nome}</strong>
            {m.valore === attiva && <span style={stili.badge}>attiva per il tuo club</span>}
            <div>{m.descrizione}</div>
          </li>
        ))}
      </ul>
      <p>
        La modalità non si cambia dall'applicazione: dipende dalla configurazione dell'installazione.
        Per passare a un'altra, chiedilo a chi gestisce Clubby per il tuo club. Percentuale e tagli si
        possono comunque preparare in anticipo nella card <strong>Ricariche</strong>.
      </p>
      <p>
        In ogni modalità le <strong>Ricevute</strong> riportano l'importo pagato, mai il credito in più:
        quello è uno sconto concesso al socio, non un incasso.
      </p>
    </>
  );
}

const stili: Record<string, React.CSSProperties> = {
  modalita: { listStyle: 'none', padding: 0, margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 },
  voceModalita: { border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px' },
  voceAttiva: { borderColor: '#16a34a', background: '#f0fdf4' },
  badge: {
    marginLeft: 8, padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600,
    background: '#16a34a', color: '#fff', whiteSpace: 'nowrap',
  },
};

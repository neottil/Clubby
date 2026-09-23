interface EtichettaProps {
  testo: string;
  colore: string;
  sfondo: string;
}

/** Etichetta colorata a pillola, per stati e tipologie nelle tabelle. */
export default function Etichetta({ testo, colore, sfondo }: EtichettaProps) {
  return <span style={{ ...stile, color: colore, background: sfondo }}>{testo}</span>;
}

const stile: React.CSSProperties = {
  display: 'inline-block', padding: '3px 10px', borderRadius: 999,
  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
};

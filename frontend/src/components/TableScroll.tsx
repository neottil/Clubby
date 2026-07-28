interface TableScrollProps {
  children: React.ReactNode;
}

// Isola lo scroll orizzontale di una tabella troppo larga per lo schermo
// dentro il proprio contenitore, invece di farlo propagare a tutta la pagina
// (che altrimenti diventa scrollabile orizzontalmente per intero).
export default function TableScroll({ children }: TableScrollProps) {
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      {children}
    </div>
  );
}

import { useAuth } from '../auth/AuthContext';
import ElencoIncontri from '../components/ElencoIncontri';

/**
 * Incontri a cui si è partecipato come socio.
 *
 * Per chi è anche istruttore, gli incontri che tiene NON stanno qui ma nella
 * pagina Resoconto: mescolare le due vesti nello stesso elenco rendeva
 * impossibile capire, riga per riga, se un incontro era un servizio ricevuto o
 * uno prestato.
 *
 * L'admin fa eccezione e vede tutti gli incontri: questa è l'unica pagina da
 * cui l'associazione li gestisce.
 */
export default function IncontriPage() {
  const { user } = useAuth();
  // I totali del periodo filtrato solo per l'admin: è la vista da cui consulta
  // gli incontri di chiunque, e da quando Resoconti non ha più la scheda "per
  // socio" è qui che quel numero va cercato. A un socio, che vede solo i
  // propri, direbbe poco e occuperebbe la riga dei filtri su schermo stretto.
  return (
    <ElencoIncontri
      titolo='Incontri'
      ambito={user?.isAdmin ? undefined : 'socio'}
      mostraTotali={!!user?.isAdmin}
    />
  );
}

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
  return <ElencoIncontri titolo='Incontri' ambito={user?.isAdmin ? undefined : 'socio'} />;
}

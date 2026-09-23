import ElencoIncontri from '../components/ElencoIncontri';

/**
 * Resoconto dell'istruttore: gli incontri che ha tenuto, con la stessa tabella
 * della pagina Incontri e, nella riga dei filtri, numero e costo complessivo
 * del periodo scelto. È anche dove li registra e li corregge.
 *
 * Riguarda il ruolo nel club, non il privilegio di amministratore: un admin che
 * è anche istruttore trova qui i propri incontri, uno che non lo è non ha
 * questa pagina.
 */
export default function ResocontoPage() {
  return <ElencoIncontri titolo='Resoconto' ambito='istruttore' mostraTotali />;
}

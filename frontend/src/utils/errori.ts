/**
 * Lettura del messaggio di un errore catturato.
 *
 * In un `catch` TypeScript tipa l'errore come `unknown`, perché JavaScript
 * permette di lanciare qualunque valore, non solo un `Error`: leggere `.message`
 * direttamente richiede quindi di dichiararlo `any`, cioè di spegnere il
 * controllo dei tipi proprio dove il valore è meno prevedibile. Il costo non è
 * teorico: se arrivasse qualcosa che non è un `Error`, `.message` sarebbe
 * `undefined` e l'utente vedrebbe un avviso vuoto invece del motivo del
 * fallimento.
 *
 * Qui il controllo si fa una volta sola. Il testo predefinito garantisce che
 * un errore inatteso resti comunque visibile: meglio un messaggio generico di
 * un fallimento silenzioso.
 */
export function messaggioErrore(e: unknown, predefinito = 'Operazione non riuscita'): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return predefinito;
}

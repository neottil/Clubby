/**
 * Come si chiama una ricevuta, e come la si consegna a chi la scarica.
 *
 * Il codice e il nome del file derivano dagli stessi due numeri, in un punto
 * solo: prima erano calcolati in tre posti diversi — la tabella delle ricevute
 * usava il `nome_file` del database, i movimenti del socio ripiegavano su
 * "ricevuta.pdf" — e lo stesso documento arrivava sul disco con nomi diversi a
 * seconda di dove lo si era cliccato.
 */

/** Il codice mostrato all'utente: "2026_60". */
export function codiceRicevuta(anno: number, numero: number): string {
  return `${anno}_${numero}`;
}

/**
 * Il nome del file scaricato: "ricevuta_2026_60.pdf".
 *
 * Coincide con `documento.nome_file` prodotto dal backend. Qui si ricalcola
 * invece di usare quel campo perché le ricevute emesse prima di questa
 * convenzione ne portano uno vecchio: derivarlo rende uniformi anche quelle,
 * senza toccare i byte già conservati.
 */
export function nomeFileRicevuta(anno: number, numero: number): string {
  return `ricevuta_${codiceRicevuta(anno, numero)}.pdf`;
}

/**
 * Consegna un blob al browser come download.
 *
 * Un semplice link non basta: il PDF arriva da una fetch autenticata (il token
 * viaggia in un header), quindi si passa da un object URL. La revoca è
 * differita perché revocarlo subito annullerebbe il download appena avviato.
 */
export function scaricaBlob(blob: Blob, nomeFile: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

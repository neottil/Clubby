/**
 * Date di calendario ricevute dal client, sempre nel formato "YYYY-MM-DD".
 */

/** True se `valore` è una data di calendario reale in formato "YYYY-MM-DD". */
export function dataValida(valore: unknown): valore is string {
  if (typeof valore !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valore)) return false;
  const [anno, mese, giorno] = valore.split('-').map(Number);
  const data = new Date(Date.UTC(anno, mese - 1, giorno));
  // Una data inesistente (31 aprile) viene "normalizzata" al mese dopo:
  // confrontando le componenti la si riconosce.
  return data.getUTCFullYear() === anno && data.getUTCMonth() === mese - 1 && data.getUTCDate() === giorno;
}

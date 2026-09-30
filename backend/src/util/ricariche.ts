/**
 * Modalità con cui si registra una ricarica di voucher, scelta per ambiente
 * con la variabile RECHARGE_MODE.
 *
 *   free        L'admin scrive l'importo. È quanto il socio paga ed è quanto
 *               riceve sul voucher: le due cose coincidono. (predefinita)
 *   percentage  L'admin scrive l'importo pagato; sul voucher finisce quello
 *               stesso importo aumentato di una percentuale, configurata
 *               dall'admin (impostazione "percentuale_ricarica").
 *   map         L'admin sceglie da un elenco di tagli preconfigurati
 *               (tabella ricarica_taglio): ogni taglio dichiara quanto si paga
 *               e quanto viene accreditato, es. 100 → 110.
 *
 * In tutte e tre, le ricevute contano SOLO l'importo pagato: il valore
 * aggiunto non è denaro incassato, e registrarlo significherebbe dichiarare un
 * ricavo che non c'è stato.
 *
 * Un valore sconosciuto o mancante vale 'free', cioè il comportamento che
 * l'applicazione ha sempre avuto: un errore di battitura nella variabile non
 * deve accreditare ai soci soldi che nessuno ha deciso di regalare.
 */

export type ModalitaRicarica = 'free' | 'percentage' | 'map';

const MODALITA: ModalitaRicarica[] = ['free', 'percentage', 'map'];

export function modalitaRicarica(): ModalitaRicarica {
  const valore = process.env.RECHARGE_MODE;
  return MODALITA.includes(valore as ModalitaRicarica)
    ? (valore as ModalitaRicarica)
    : 'free';
}

/**
 * Arrotonda a due decimali il valore accreditato, che in modalità percentuale
 * nasce da una moltiplicazione: 33,33 + 15% farebbe 38,3295, e un saldo con
 * quattro decimali non è rappresentabile nella colonna (DECIMAL(10,2)) né
 * spiegabile a un socio.
 */
export function arrotondaImporto(valore: number): number {
  return Math.round(valore * 100) / 100;
}

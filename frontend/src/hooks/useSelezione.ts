/**
 * Selezione multipla su un elenco caricato a pagine.
 *
 * Serve a due tabelle — gli incontri da rendicontare e le voci da registrare —
 * che hanno lo stesso identico comportamento: si spuntano alcune righe (o tutte
 * quelle a video), si preme un pulsante, e quelle righe vengono marcate.
 *
 * Due proprietà che non sono ovvie e che sono il motivo per cui questa logica
 * sta qui invece che dentro le tabelle:
 *
 * 1. Gli identificativi scelti SOPRAVVIVONO a "Carica altri". Chi spunta le
 *    prime 25 righe, carica le successive e spunta anche quelle, se le ritrova
 *    tutte e 50 selezionate. Per questo la selezione è un insieme di id e non
 *    un sottoinsieme delle righe visibili.
 *
 * 2. La selezione si AZZERA a ogni cambio di filtro. Sopravvivere a un cambio
 *    di periodo o di istruttore vorrebbe dire tenere viva una scelta fatta su
 *    righe che non si vedono più — cioè marcare qualcosa che non si è guardato.
 *    Chi usa l'hook passa una `chiave` che cambia con i filtri.
 */

import { useEffect, useMemo, useState } from 'react';

export interface Selezione {
  /** Identificativi attualmente scelti. */
  ids: string[];
  quanti: number;
  contiene: (id: string) => boolean;
  inverti: (id: string) => void;
  /** Aggiunge o toglie in blocco gli id selezionabili attualmente a video. */
  invertiTutti: () => void;
  azzera: () => void;
  /** Tutte le righe selezionabili a video sono scelte (e ce n'è almeno una). */
  tutte: boolean;
  /** Alcune sì e altre no: lo stato "indeterminato" della casella in testata. */
  parziale: boolean;
}

/**
 * @param selezionabili id delle righe attualmente a video che si POSSONO
 *   scegliere. Le righe già processate non vanno passate: la loro casella è
 *   spuntata e disabilitata, e non devono finire né nel conteggio del pulsante
 *   né in ciò che "seleziona tutti" sceglie.
 * @param chiave valore che cambia quando cambiano i filtri; al suo variare la
 *   selezione viene azzerata.
 */
export function useSelezione(selezionabili: string[], chiave: string): Selezione {
  const [scelti, setScelti] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setScelti(new Set());
  }, [chiave]);

  // Il confronto è fra id e non fra indici: le righe a video cambiano a ogni
  // "Carica altri", la selezione no.
  const { tutte, parziale } = useMemo(() => {
    const presenti = selezionabili.filter(id => scelti.has(id)).length;
    return {
      tutte: selezionabili.length > 0 && presenti === selezionabili.length,
      parziale: presenti > 0 && presenti < selezionabili.length,
    };
  }, [selezionabili, scelti]);

  return {
    ids: [...scelti],
    quanti: scelti.size,
    contiene: id => scelti.has(id),
    inverti: id => setScelti(prima => {
      const dopo = new Set(prima);
      if (!dopo.delete(id)) dopo.add(id);
      return dopo;
    }),
    // Se sono già tutte scelte toglie le sole righe a video, lasciando intatto
    // ciò che era stato scelto su pagine caricate prima e poi filtrate via.
    invertiTutti: () => setScelti(prima => {
      const dopo = new Set(prima);
      const aggiungi = !selezionabili.every(id => dopo.has(id));
      for (const id of selezionabili) {
        if (aggiungi) dopo.add(id); else dopo.delete(id);
      }
      return dopo;
    }),
    azzera: () => setScelti(new Set()),
    tutte,
    parziale,
  };
}

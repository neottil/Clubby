import { useEffect, useRef, useState } from 'react';

/** Risposta di un elenco paginato del backend (più eventuali campi propri). */
export interface Pagina<T> {
  data: T[];
  /** Righe che soddisfano i filtri in tutto, non quelle restituite. */
  total: number;
}

/**
 * Elenco caricato dal backend a blocchi, con "Carica altri" (vedi CaricaAltri).
 *
 * `carica` riceve l'offset e restituisce la pagina: filtri e ordinamento li
 * mette lui nella richiesta. Ogni cambio di `dipendenze` (filtri, ordinamento)
 * riparte dal primo blocco, sostituendo le righe già caricate, che
 * rispondevano a criteri diversi.
 *
 * Scarta le risposte superate: dopo un cambio di filtro rapido una risposta
 * vecchia può arrivare dopo quella nuova, e senza questo controllo la
 * sovrascriverebbe (o, per "Carica altri", accoderebbe righe di un altro filtro).
 *
 * `risposta` è l'ultima pagina ricevuta, per i campi oltre a data e total
 * (totali, conteggi).
 *
 * `abilitato` a false rimanda il caricamento: serve quando un filtro dipende
 * da un dato ancora in arrivo, per non fare una prima richiesta sbagliata.
 */
export function useElencoPaginato<T, R extends Pagina<T> = Pagina<T>>(
  carica: (offset: number) => Promise<R>,
  dipendenze: unknown[],
  onErrore: (messaggio: string) => void,
  abilitato = true,
) {
  const [righe, setRighe]             = useState<T[]>([]);
  const [totale, setTotale]           = useState(0);
  const [risposta, setRisposta]       = useState<R | null>(null);
  const [loading, setLoading]         = useState(true);
  // Diventa true al primo caricamento riuscito: da lì in poi un ricaricamento
  // non sostituisce la tabella con "Caricamento...", che smonterebbe i filtri
  // mentre si digita.
  const [caricato, setCaricato]       = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const richiestaCorrente = useRef(0);
  // Sempre l'ultima versione: le funzioni sotto sono richiamate da effetti e
  // bottoni, e con una chiusura vecchia userebbero filtri superati.
  const caricaRef = useRef(carica);
  caricaRef.current = carica;
  const onErroreRef = useRef(onErrore);
  onErroreRef.current = onErrore;
  const caricateRef = useRef(0);

  /** Riparte dal primo blocco. */
  const ricarica = async () => {
    const richiesta = ++richiestaCorrente.current;
    setLoading(true);
    try {
      const r = await caricaRef.current(0);
      if (richiesta !== richiestaCorrente.current) return;
      setRighe(r.data);
      caricateRef.current = r.data.length;
      setTotale(r.total);
      setRisposta(r);
      setCaricato(true);
    } catch (e: any) {
      if (richiesta === richiestaCorrente.current) onErroreRef.current(e.message);
    } finally {
      if (richiesta === richiestaCorrente.current) setLoading(false);
    }
  };

  /** Accoda il blocco successivo. */
  const caricaAltri = async () => {
    const richiesta = richiestaCorrente.current;
    setLoadingMore(true);
    try {
      const r = await caricaRef.current(caricateRef.current);
      if (richiesta !== richiestaCorrente.current) return;
      setRighe(prev => [...prev, ...r.data]);
      caricateRef.current += r.data.length;
      setTotale(r.total);
      setRisposta(r);
    } catch (e: any) {
      onErroreRef.current(e.message);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { if (abilitato) ricarica(); }, [...dipendenze, abilitato]);

  return { righe, totale, risposta, loading, caricato, loadingMore, caricaAltri, ricarica };
}

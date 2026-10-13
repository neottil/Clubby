/**
 * Testo della pagina Manuale, diviso in sezioni (spec 005).
 *
 * Ogni sezione dichiara a chi si rivolge con `visibile`; la pagina filtra e
 * rende, senza sapere niente del contenuto. Chi cambia cosa vede un ruolo, o
 * il nome di una pagina, di una card o di un pulsante, aggiorna anche questo
 * file: un'istruzione che nomina un pulsante che non c'è più manda fuori
 * strada chi la segue.
 *
 * I nomi dell'interfaccia stanno in grassetto e scritti esattamente come a
 * video, perché chi legge li cerca con l'occhio.
 */

import type { ReactNode } from 'react';
import type { ModalitaRicarica, Moduli } from '../config';
import ModalitaRicariche from './ModalitaRicariche';

export interface ContestoManuale {
  admin: boolean;
  istruttore: boolean;
  /** null = non ancora saputo: in quel caso le sezioni del socio si mostrano. */
  schedaCollegata: boolean | null;
  moduli: Moduli;
  modalitaRicarica: ModalitaRicarica;
}

export interface Sezione {
  id: string;
  titolo: string;
  /** Gruppo dell'indice: chi legge capisce subito a che titolo vede la sezione. */
  gruppo: 'Per iniziare' | 'I tuoi dati' | 'Istruttore' | 'Amministrazione';
  visibile: (c: ContestoManuale) => boolean;
  contenuto: (c: ContestoManuale) => ReactNode;
}

/** Chi ha (o potrebbe avere) una scheda socio: vede i propri dati. */
const haScheda = (c: ContestoManuale) => c.schedaCollegata !== false;

export const SEZIONI: Sezione[] = [
  // ---------------------------------------------------------------------
  // Per iniziare
  // ---------------------------------------------------------------------
  {
    id: 'scheda-non-collegata',
    titolo: 'Il tuo account non è ancora collegato',
    gruppo: 'Per iniziare',
    visibile: c => !c.admin && c.schedaCollegata === false,
    contenuto: () => (
      <>
        <p>
          Il tuo account esiste, ma non è ancora collegato alla tua <strong>scheda socio</strong>, cioè ai
          dati che l'associazione tiene su di te: voucher, incontri, tesseramenti. Finché non lo è, le pagine
          ti sembreranno vuote, e non è un guasto.
        </p>
        <p>
          Chiedi a un amministratore del club di collegarlo. Appena lo fa, ritrovi qui sotto le istruzioni
          per consultare i tuoi dati.
        </p>
      </>
    ),
  },
  {
    id: 'menu',
    titolo: 'Come muoversi',
    gruppo: 'Per iniziare',
    visibile: () => true,
    contenuto: () => (
      <>
        <p>
          Tutte le pagine si raggiungono dal <strong>menu</strong>, il pulsante con le tre righe in alto a
          destra. Il menu mostra solo le pagine che puoi usare: se una pagina descritta qui non c'è, il tuo
          club non la usa. Il logo in alto a sinistra riporta alla pagina <strong>Voucher</strong>, che è
          la pagina iniziale.
        </p>
        <p>
          In fondo al menu trovi l'email con cui hai fatto l'accesso e il pulsante <strong>Esci</strong>.
          La pagina <strong>Info</strong> mostra le versioni dell'applicazione: è utile a chi ti dà assistenza,
          e si apre anche senza aver fatto l'accesso.
        </p>
        <p>
          Gli elenchi lunghi si caricano a blocchi: in fondo alla tabella un contatore dice quante righe
          vedi sul totale, e <strong>Carica altri</strong> aggiunge le successive. Ricerca, filtri e totali
          valgono sempre sull'intero elenco, non solo sulle righe già a video.
        </p>
      </>
    ),
  },

  // ---------------------------------------------------------------------
  // I tuoi dati — chiunque abbia una scheda socio
  // ---------------------------------------------------------------------
  {
    id: 'il-tuo-voucher',
    titolo: 'Il tuo voucher e i movimenti',
    gruppo: 'I tuoi dati',
    visibile: haScheda,
    contenuto: c => (
      <>
        <p>
          Il <strong>voucher</strong> è il credito prepagato con cui paghi gli incontri. Nella pagina{' '}
          <strong>Voucher</strong>, in cima, la card <strong>Il tuo voucher</strong> mostra il{' '}
          <strong>Saldo residuo</strong>, la data da cui è <strong>Attivo dal</strong> e
          l'<strong>Ultima ricarica</strong>, con data e importo.
        </p>
        <p>
          Il pulsante <strong>Movimenti</strong> apre l'elenco di tutto ciò che è entrato e uscito: le{' '}
          <strong>ricariche</strong> (il credito acquistato, in positivo) e gli <strong>addebiti</strong>{' '}
          (gli incontri pagati con il voucher, in negativo). Da un addebito si apre il dettaglio
          dell'incontro che lo ha generato. Se il club riconosce un credito in più sulle ricariche, sotto
          il credito ricevuto è indicato l'importo che hai pagato.
        </p>
        <p>
          Se leggi <strong>Non hai un voucher attivo</strong>, paghi gli incontri a parte: chiedi al club
          se vuoi attivarne uno.
        </p>
        {c.moduli.tesseramento && (
          <p>
            Accanto al voucher (sopra, su un telefono) la card <strong>La tua tessera</strong> mostra il{' '}
            <strong>Numero</strong> della tua tessera, lo stato del tesseramento (attivo, in scadenza,
            scaduto o mai tesserato), la <strong>Scadenza</strong> e la data dell'<strong>Ultimo rinnovo</strong>.
          </p>
        )}
      </>
    ),
  },
  {
    id: 'i-tuoi-incontri',
    titolo: 'I tuoi incontri',
    gruppo: 'I tuoi dati',
    // L'admin, in Incontri, vede gli incontri di tutti: la sua sezione è in
    // Amministrazione.
    visibile: c => haScheda(c) && !c.admin,
    contenuto: c => (
      <>
        <p>
          La pagina <strong>Incontri</strong> elenca gli incontri a cui hai partecipato, in sola lettura:
          data, attività, istruttore e costo. Puoi cercare, filtrare per attività e per periodo, e ordinare
          le colonne facendo clic sull'intestazione. Il pulsante <strong>Visualizza</strong> apre le note
          dell'incontro, quando ci sono.
        </p>
        {c.istruttore && (
          <p>
            Da istruttore, qui trovi solo gli incontri a cui hai partecipato <em>come socio</em>. Quelli che
            tieni tu sono nella pagina <strong>Resoconto</strong>.
          </p>
        )}
      </>
    ),
  },
  {
    id: 'il-tuo-tesseramento',
    titolo: 'Il tuo tesseramento',
    gruppo: 'I tuoi dati',
    visibile: c => c.moduli.tesseramento && haScheda(c) && !c.admin,
    contenuto: () => (
      <p>
        La pagina <strong>Tesseramenti</strong> ti dice quando scade il tuo tesseramento al club e mostra
        lo storico dei rinnovi, con la data, la nuova scadenza, il numero della tessera e la quota pagata. I rinnovi li registra
        l'associazione: se la data non torna, chiedi a un amministratore.
      </p>
    ),
  },
  {
    id: 'le-tue-ricevute',
    titolo: 'Le tue ricevute',
    gruppo: 'I tuoi dati',
    visibile: c => c.moduli.ricevute && haScheda(c),
    contenuto: c => (
      <>
        <p>
          Quando il club emette una ricevuta per un tuo pagamento, la riga che l'ha generata mostra nella
          colonna <strong>Ricevuta</strong> un codice come <strong>2026_12</strong> (anno e numero). Facendo
          clic sul codice scarichi il PDF.
        </p>
        <p>
          Il codice compare dove nasce un pagamento: nei <strong>Movimenti</strong> del tuo voucher (le
          ricariche), negli <strong>Incontri</strong> pagati a parte
          {c.moduli.tesseramento && <>, e nei rinnovi della pagina <strong>Tesseramenti</strong></>}. Una
          riga senza codice non è ancora stata documentata.
        </p>
      </>
    ),
  },

  // ---------------------------------------------------------------------
  // Istruttore
  // ---------------------------------------------------------------------
  {
    id: 'istruttore-soci-voucher',
    titolo: 'Soci e voucher dei soci',
    gruppo: 'Istruttore',
    // L'admin vede e gestisce tutto: le sue sezioni lo coprono già.
    visibile: c => c.istruttore && !c.admin,
    contenuto: () => (
      <>
        <p>
          La pagina <strong>Soci</strong> elenca i soci del club, con il solo nominativo: ti serve per
          sapere chi c'è quando registri un incontro.
        </p>
        <p>
          Nella pagina <strong>Voucher</strong>, sotto il tuo voucher, la tabella mostra i voucher di tutti
          i soci con il <strong>saldo residuo</strong>, per sapere prima di un incontro se il credito basta.
          I movimenti degli altri soci invece non li vedi: sono affari loro e dell'associazione. I tuoi li
          trovi nella card <strong>Il tuo voucher</strong>, come descritto sopra.
        </p>
      </>
    ),
  },
  {
    id: 'istruttore-resoconto',
    titolo: 'Gli incontri che tieni: la pagina Resoconto',
    gruppo: 'Istruttore',
    // Un admin istruttore non ha la pagina Resoconto: consulta gli stessi
    // dati da Resoconti, scegliendo sé stesso (vedi la sezione relativa).
    visibile: c => c.istruttore && !c.admin,
    contenuto: () => (
      <>
        <p>
          Puoi comparire in un incontro in due modi, e l'applicazione li tiene separati: in{' '}
          <strong>Incontri</strong> quelli a cui partecipi come socio, in <strong>Resoconto</strong> quelli
          che tieni come istruttore.
        </p>
        <p>
          In <strong>Resoconto</strong> registri un incontro con <strong>+ Nuovo incontro</strong>: scegli il
          socio, la data e l'attività. Il costo viene proposto dal listino e puoi correggerlo; le note si
          scrivono in testo semplice o, spuntando <strong>Markdown</strong>, con titoli ed elenchi. Puoi
          scegliere solo le attività a cui il club ti ha abilitato: se ne manca una, chiedila a un
          amministratore. Se il socio ha un voucher, il costo gli viene addebitato da solo.
        </p>
        <p>
          Con <strong>Modifica</strong> ed <strong>Elimina</strong> correggi un incontro registrato per
          errore. I filtri per attività e periodo aggiornano numero e costo complessivo degli incontri,
          scritti nella riga dei filtri: è il conteggio del tuo lavoro nel periodo scelto.
        </p>
        <p>
          Quando il club ti ha riconosciuto un incontro, la riga dice <strong>Rendicontato</strong> e non si
          può più modificare né eliminare; lo stesso vale per <strong>In ricevuta</strong>. Per correggere un
          errore contattare l'amministratore. Spegnendo lo switch{' '}
          <strong>Mostra anche gli incontri già rendicontati</strong> li nascondi, e resta solo ciò che
          il club deve ancora riconoscerti.
        </p>
      </>
    ),
  },

  // ---------------------------------------------------------------------
  // Amministrazione
  // ---------------------------------------------------------------------
  {
    id: 'admin-soci',
    titolo: 'Soci',
    gruppo: 'Amministrazione',
    visibile: c => c.admin,
    contenuto: c => (
      <>
        <p>
          La pagina <strong>Soci</strong> è l'anagrafica: <strong>+ Nuovo socio</strong> crea una scheda,{' '}
          <strong>Modifica</strong> ed <strong>Elimina</strong> la correggono o la tolgono. Una scheda socio
          e un account sono due cose diverse: la scheda è la persona per l'associazione, l'account è il
          modo di entrare nell'applicazione. Si collegano dalle Impostazioni (vedi sotto).
        </p>
        {c.moduli.tesseramento && (
          <p>
            La colonna <strong>N° tessera</strong> riporta il numero dell'ultimo tesseramento di ogni socio;
            la ricerca trova un socio anche per numero di tessera.
          </p>
        )}
        <p>
          Un socio con voci già comprese in una ricevuta o con incontri rendicontati non si può eliminare:
          cancellarlo si porterebbe dietro documenti che devono restare.
        </p>
      </>
    ),
  },
  {
    id: 'admin-voucher',
    titolo: 'Voucher e ricariche',
    gruppo: 'Amministrazione',
    visibile: c => c.admin,
    contenuto: c => (
      <>
        <p>
          Nella pagina <strong>Voucher</strong> vedi i voucher di tutti i soci. <strong>+ Nuovo voucher</strong>{' '}
          ne crea uno per un socio che non lo ha: nasce senza credito, e subito dopo si apre la ricarica con
          cui registrare quanto ha pagato. La spunta <strong>Importa il saldo di un voucher già esistente</strong>{' '}
          serve solo all'avvio, per portare in Clubby un credito venduto prima: non è un incasso e non
          finisce nelle ricevute.
        </p>
        <p>
          Su ogni riga, <strong>Movimenti</strong> apre ricariche e addebiti del voucher, e{' '}
          <strong>Ricarica</strong> registra un nuovo acquisto di credito. Gli addebiti non si inseriscono
          a mano: nascono dagli incontri. Se hai una scheda socio, il tuo voucher è nella card in cima.
        </p>
        <h4 style={stili.sottotitolo}>Modalità di ricarica</h4>
        <ModalitaRicariche attiva={c.modalitaRicarica} />
      </>
    ),
  },
  {
    id: 'admin-incontri',
    titolo: 'Incontri',
    gruppo: 'Amministrazione',
    visibile: c => c.admin,
    contenuto: () => (
      <p>
        In <strong>Incontri</strong> vedi e gestisci gli incontri di tutti, con numero e costo complessivo
        del periodo filtrato. Li registri con <strong>+ Nuovo incontro</strong> scegliendo anche
        l'istruttore, e li correggi con <strong>Modifica</strong> ed <strong>Elimina</strong>, finché non
        sono rendicontati o compresi in una ricevuta.
      </p>
    ),
  },
  {
    id: 'admin-resoconti',
    titolo: 'Resoconti e rendicontazione',
    gruppo: 'Amministrazione',
    visibile: c => c.admin,
    contenuto: c => (
      <>
        <p>
          In <strong>Resoconti</strong> scegli un <strong>Istruttore</strong> e vedi gli incontri che ha
          tenuto, con gli stessi filtri e totali della pagina Incontri.
          {c.istruttore && <> Per i tuoi incontri da istruttore, scegli te stesso.</>}
        </p>
        <p>
          Qui segni gli incontri già riconosciuti all'istruttore: li selezioni con le caselle della prima
          colonna (quella in testata li prende tutti) e premi <strong>Rendiconta</strong>. La selezione
          resta anche caricando altri blocchi, e si azzera cambiando un filtro. Di partenza vedi solo ciò
          che resta da rendicontare; lo switch <strong>Mostra anche gli incontri già rendicontati</strong>{' '}
          fa tornare gli altri.
        </p>
        <p>
          La rendicontazione <strong>non si annulla</strong>, e da quel momento l'incontro non si modifica
          né si elimina più: il conteggio su cui l'istruttore è stato pagato deve restare ricostruibile. Per
          correggere un errore contattare l'amministratore.
        </p>
      </>
    ),
  },
  {
    id: 'admin-tesseramenti',
    titolo: 'Tesseramenti',
    gruppo: 'Amministrazione',
    visibile: c => c.admin && c.moduli.tesseramento,
    contenuto: () => (
      <>
        <p>
          In <strong>Tesseramenti</strong> trovi la scadenza di ogni socio, con lo stato (attivo, in scadenza,
          scaduto, mai tesserato) e il filtro per stato. <strong>Rinnova</strong> registra un rinnovo; per chi
          non è mai stato tesserato lo stesso pulsante si chiama <strong>Tessera</strong> e registra il primo
          tesseramento. Si indicano il <strong>Numero di tessera</strong> (obbligatorio: è quello della
          tessera nuova consegnata al socio), la data, la nuova scadenza e la quota, proposta dal valore configurato nelle
          Impostazioni e modificabile. La nuova scadenza deve seguire sia la data del rinnovo sia la scadenza
          precedente.
        </p>
        <p>
          Un numero di tessera appartiene a un solo socio: lo stesso socio può tenerlo da un rinnovo
          all'altro, ma non si può assegnarlo a un altro.
        </p>
        <p>
          <strong>Storico</strong> mostra i rinnovi passati. Sul tesseramento in corso — l'ultimo, se non è
          scaduto — <strong>Correggi</strong> (o <strong>Aggiungi</strong>, se manca) cambia il numero di
          tessera; date e quota non si modificano. I tesseramenti chiusi restano come sono: un socio scaduto
          prende il numero nuovo rinnovando.
        </p>
      </>
    ),
  },
  {
    id: 'admin-ricevute',
    titolo: 'Ricevute',
    gruppo: 'Amministrazione',
    visibile: c => c.admin && c.moduli.ricevute,
    contenuto: c => (
      <>
        <p>
          La pagina <strong>Ricevute</strong> raccoglie ciò che il club incassa: le ricariche dei voucher,
          {c.moduli.tesseramento && ' le quote di tesseramento,'} e gli incontri pagati a parte da chi non ha
          un voucher. Gli addebiti sul voucher non ci sono, perché li paga già la ricarica.
        </p>
        <p>
          Prima di tutto va scritta l'<strong>intestazione</strong> delle ricevute, nella card{' '}
          <strong>Ricevute</strong> delle Impostazioni: finché manca, la voce di menu è spenta e il{' '}
          <strong>?</strong> accanto spiega perché.
        </p>
        <p>
          Nella scheda <strong>Crea ricevuta</strong> filtri per socio e per periodo e selezioni le voci di{' '}
          <strong>un solo socio</strong> (una ricevuta è intestata a una persona). Scrivi la causale e premi{' '}
          <strong>Genera anteprima</strong>: controlla il PDF, poi <strong>Conferma ed emetti</strong>.
          Solo la conferma assegna il numero definitivo, che riparte da 1 ogni anno.
        </p>
        <p>
          Una ricevuta emessa <strong>non si annulla e non si elimina</strong>, ed è per questo che esiste
          l'anteprima. Da quel momento le voci comprese non si modificano più. La scheda{' '}
          <strong>Ricevute emesse</strong> conserva tutti i PDF, che anche il socio intestatario può riaprire.
        </p>
      </>
    ),
  },
  {
    id: 'admin-impostazioni',
    titolo: 'Impostazioni',
    gruppo: 'Amministrazione',
    visibile: c => c.admin,
    contenuto: c => (
      <>
        <p>La pagina <strong>Impostazioni</strong> è divisa in card, che si aprono e si chiudono:</p>
        <ul style={stili.elenco}>
          <li>
            <strong>Ricariche</strong>: la percentuale o i tagli delle ricariche, secondo la modalità del club
            (vedi <a href="#admin-voucher">Voucher e ricariche</a>).
          </li>
          {c.moduli.tesseramento && (
            <li>
              <strong>Tesseramento</strong>: la quota proposta a ogni rinnovo. Cambiarla non tocca i rinnovi
              già registrati.
            </li>
          )}
          {c.moduli.ricevute && (
            <li>
              <strong>Ricevute</strong>: intestazione e piè di pagina dei PDF. Valgono dalla ricevuta
              successiva; quelle già emesse restano come sono.
            </li>
          )}
          <li>
            <strong>Attività</strong>: il listino, con nome e costo proposto negli incontri. Un'attività già
            usata non si cancella: si disattiva, e resta leggibile sugli incontri passati.
          </li>
          <li>
            <strong>Abilitazioni degli istruttori</strong>: per ogni istruttore, le attività che può tenere.
            Un istruttore non può registrare incontri di attività a cui non è abilitato.
          </li>
          <li>
            <strong>Soci senza utente associato</strong>: le schede che non hanno ancora un account. Si
            collegano con <strong>Collega socio</strong> dalla card successiva.
          </li>
          <li>
            <strong>Utenti - Soci</strong>: gli account. Qui colleghi o scolleghi la scheda socio
            (<strong>Collega socio</strong>, <strong>Scollega</strong>), scegli il <strong>Ruolo</strong>{' '}
            (socio o istruttore), concedi il privilegio <strong>Admin</strong>, generi una password
            temporanea con <strong>Azzera password</strong> e blocchi l'accesso con{' '}
            <strong>Disattiva</strong>, senza cancellare dati. Ruolo e privilegio admin sono indipendenti: un
            istruttore può essere admin. Non puoi togliere a te stesso il privilegio admin né disattivarti.
          </li>
        </ul>
        <p>
          Cambiare ruolo o privilegio a un account chiude le sue sessioni aperte: alla prossima apertura
          dovrà rifare l'accesso, e troverà i permessi nuovi.
        </p>
      </>
    ),
  },
];

const stili: Record<string, React.CSSProperties> = {
  sottotitolo: { margin: '20px 0 8px', fontSize: 15 },
  elenco: { paddingLeft: 20, margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 },
};

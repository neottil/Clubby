/**
 * Disegno della ricevuta in PDF.
 *
 * Questo file **non conosce il database**: riceve un DTO già completo e
 * restituisce byte. È il confine che rende estraibile un domani l'intera
 * area documenti in un servizio a sé — finché `pdf.ts` non importa
 * `db/client.js`, portarlo altrove è un copia e incolla.
 *
 * Il modello è la ricevuta cartacea già in uso dal club: testata con
 * l'intestazione a sinistra e il logo a destra sulla stessa riga, numero e
 * data, intestatario, importo in cifre e in lettere, causale, e in fondo la
 * clausola sull'esenzione dal bollo. Il dettaglio delle voci è l'unica
 * aggiunta rispetto al foglio originale.
 */

import PDFDocument from 'pdfkit';

/** Una riga del dettaglio: solo data e descrizione, come stabilito. */
export interface RigaDocumento {
  /** "YYYY-MM-DD". */
  data: string;
  descrizione: string;
  importo: number;
}

export interface DatiDocumento {
  numero: number;
  anno: number;
  /** "YYYY-MM-DD". */
  data: string;
  intestatario: string;
  causale: string;
  importo: number;
  importoLettere: string;
  righe: RigaDocumento[];
  /** Testo libero multiriga, dalle impostazioni. */
  intestazione: string;
  piePagina: string;
  /**
   * Percorso del logo già risolto in un raster, o null.
   *
   * Null non è un errore: una ricevuta senza logo è una ricevuta valida, e
   * rifiutare di emettere un documento per un elemento decorativo sarebbe
   * sproporzionato. A evitare che accada ci pensa il job `valida-branding`.
   */
  logo: string | null;
}

const MARGINE = 56;         // ~2 cm
const LATO_LOGO = 90;       // ~3,2 cm
const GRIGIO = '#444444';

/** "2027-01-15" → "15/01/2027", senza passare da Date (niente fusi orari). */
function dataItaliana(iso: string): string {
  const [anno, mese, giorno] = iso.slice(0, 10).split('-');
  return `${giorno}/${mese}/${anno}`;
}

/** "160" → "160,00": la virgola decimale, come ovunque nell'interfaccia. */
function importoItaliano(valore: number): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valore);
}

/**
 * Genera il PDF e ne restituisce i byte.
 *
 * `pdfkit` scrive su uno stream: la Promise si risolve a documento chiuso,
 * quando tutti i chunk sono stati raccolti.
 */
export function generaDocumentoPdf(dati: DatiDocumento): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGINE });
    const chunks: Buffer[] = [];

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      disegna(doc, dati);
      doc.end();
    } catch (errore) {
      reject(errore);
    }
  });
}

function disegna(doc: PDFKit.PDFDocument, dati: DatiDocumento): void {
  const larghezza = doc.page.width - MARGINE * 2;

  // --- Testata: intestazione a sinistra, logo a destra -------------------
  // Le due cose stanno sulla STESSA riga e partono dalla stessa y, come la
  // carta intestata di un'associazione. L'intestazione si restringe per non
  // finire sotto al logo; senza logo usa tutta la larghezza.
  //
  // `fit` scala il DISEGNO, non i pixel: l'immagine esce sempre della misura
  // giusta qualunque sia la sua risoluzione. Quello che fit non fa è
  // ricampionare — i byte originali finiscono comunque dentro ogni ricevuta,
  // ed è il motivo per cui le dimensioni sono un vincolo di pipeline
  // (valida-branding) e non un controllo a runtime.
  const yTestata = doc.y;

  if (dati.logo) {
    doc.image(dati.logo, doc.page.width - MARGINE - LATO_LOGO, yTestata, {
      fit: [LATO_LOGO, LATO_LOGO],
      align: 'right',
    });
  }

  if (dati.intestazione.trim()) {
    // Il logo non sposta doc.y (pdfkit non lo fa quando x e y sono espliciti),
    // quindi il testo parte davvero dalla stessa riga.
    const larghezzaTesto = dati.logo ? larghezza - LATO_LOGO - 16 : larghezza;
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000');
    for (const riga of dati.intestazione.split('\n')) {
      doc.text(riga.trim(), MARGINE, doc.y, { width: larghezzaTesto, align: 'left' });
      doc.font('Helvetica').fontSize(10).fillColor(GRIGIO);
    }
  }

  // Sotto la testata ci si va comunque: se il logo è più alto dell'indirizzo,
  // è lui a decidere dove ricomincia il documento.
  doc.y = Math.max(doc.y, yTestata + (dati.logo ? LATO_LOGO : 0));

  doc.moveDown(4);

  // --- Numero e data ----------------------------------------------------
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#000000');
  doc.text(
    `RICEVUTA N. ${dati.numero} / ${dati.anno} DEL ${dataItaliana(dati.data)}`,
    MARGINE,
    doc.y,
    { width: larghezza, align: 'center' }
  );

  doc.moveDown(2);

  // --- Corpo ------------------------------------------------------------
  doc.font('Helvetica').fontSize(11).fillColor('#000000');
  doc.text(`Ricevuto da: ${dati.intestatario}`, MARGINE, doc.y, { width: larghezza });
  doc.moveDown(0.6);
  doc.text(
    `La somma di: ${dati.importoLettere} (${importoItaliano(dati.importo)})`,
    MARGINE,
    doc.y,
    { width: larghezza }
  );
  doc.moveDown(0.6);
  doc.text(`Per la seguente causale: ${dati.causale}`, MARGINE, doc.y, { width: larghezza });

  // --- Dettaglio --------------------------------------------------------
  if (dati.righe.length > 0) {
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(10).text('Dettaglio:', MARGINE, doc.y);
    doc.moveDown(0.4);

    const xData = MARGINE + 12;
    const xDescrizione = xData + 70;
    const xImporto = doc.page.width - MARGINE - 80;

    doc.font('Helvetica').fontSize(10).fillColor(GRIGIO);
    for (const riga of dati.righe) {
      // Il documento continua sulla pagina successiva invece di scrivere sul
      // piè di pagina: un socio con molti incontri non deve produrre una
      // ricevuta illeggibile.
      if (doc.y > doc.page.height - MARGINE - 90) {
        doc.addPage();
      }
      const y = doc.y;
      doc.text(dataItaliana(riga.data), xData, y, { width: 66 });
      doc.text(riga.descrizione, xDescrizione, y, { width: xImporto - xDescrizione - 8 });
      doc.text(importoItaliano(riga.importo), xImporto, y, { width: 80, align: 'right' });
      doc.y = Math.max(doc.y, y) + 4;
    }
  }

  // --- Piè di pagina ----------------------------------------------------
  // La clausola sul bollo è testo fisso configurato dall'admin: l'esenzione
  // dipende dalla natura dell'associazione, non dall'importo, quindi non c'è
  // niente da calcolare.
  if (dati.piePagina.trim()) {
    doc.moveDown(3);
    doc.font('Helvetica').fontSize(9).fillColor(GRIGIO);
    doc.text(dati.piePagina.trim(), MARGINE, doc.y, { width: larghezza, align: 'center' });
  }
}

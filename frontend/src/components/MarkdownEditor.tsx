import { Suspense, lazy } from 'react';

/**
 * Confine di code splitting per @mdxeditor/editor. Chi importa questo modulo
 * non tira dentro la libreria: viene scaricata al primo montaggio effettivo di
 * un editor o di una nota, non al caricamento della pagina.
 *
 * Sono due lazy() distinti perché i due casi hanno pesi molto diversi: la
 * modale di lettura la aprono anche i viewer e le basta il rendering, mentre
 * toolbar e vista sorgente (con CodeMirror) servono solo agli admin che
 * scrivono. Rollup mette in comune la parte condivisa, quindi chi usa
 * entrambi non scarica nulla due volte.
 */
const EditorImpl = lazy(() => import('./MarkdownEditorImpl'));
const ViewImpl   = lazy(() => import('./MarkdownViewImpl'));

// Funzione e non costante: `styles` è dichiarato in fondo al file (come negli
// altri componenti), quindi valutarlo qui a livello di modulo lo leggerebbe
// prima dell'inizializzazione.
const fallback = () => <div style={styles.loading}>Caricamento editor...</div>;

// L'area di contenuto di MDXEditor è raggiungibile solo per classe
// (contentEditableClassName), non con uno style inline: senza altezza minima
// il campo collasserebbe a una riga, più basso della textarea che sostituisce.
const css = `
  .cm-markdown-editor { min-height: 160px; }
  .cm-markdown-editor:focus-visible { outline: none; }
  /* In sola lettura il contenuto non deve sembrare un campo editabile. */
  .cm-markdown-view { padding: 0; }
  .cm-markdown-view:focus-visible { outline: none; }
  /* Il margine del primo e dell'ultimo blocco (un titolo, un elenco) resta
     dentro la nota e sembra una riga vuota: fuori da un editor non serve. */
  .cm-markdown-view > :first-child { margin-top: 0; }
  .cm-markdown-view > :last-child { margin-bottom: 0; }
`;

interface MarkdownEditorProps {
  markdown: string;
  onChange: (markdown: string) => void;
}

/**
 * Editor Markdown con barra dei comandi e switch visuale/editor.
 *
 * ATTENZIONE: `markdown` è il valore *iniziale*. MDXEditor mantiene il proprio
 * stato interno e non si riallinea se la prop cambia dopo il montaggio; per
 * caricare una nota diversa va rimontato con una `key` diversa (vedi
 * IncontriPage).
 */
export function MarkdownEditor({ markdown, onChange }: MarkdownEditorProps) {
  return (
    <div style={styles.editorFrame}>
      <style>{css}</style>
      <Suspense fallback={fallback()}>
        <EditorImpl markdown={markdown} onChange={onChange} />
      </Suspense>
    </div>
  );
}

/** Rende una nota Markdown in sola lettura. */
export function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <>
      <style>{css}</style>
      <Suspense fallback={fallback()}>
        <ViewImpl markdown={markdown} />
      </Suspense>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // Riquadro attorno all'editor: MDXEditor non ne disegna uno, senza questo
  // il campo non si distingue dagli altri input del form.
  editorFrame: { border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' },
  loading: { padding: 16, fontSize: 13, color: '#666' },
};

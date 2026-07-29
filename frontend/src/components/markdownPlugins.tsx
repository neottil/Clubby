import {
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  linkPlugin,
  imagePlugin,
  tablePlugin,
  codeBlockPlugin,
  type CodeBlockEditorProps,
} from '@mdxeditor/editor';

/**
 * Blocco di codice in sola lettura.
 *
 * La barra dei comandi non permette di inserire codice, ma un blocco può
 * comunque arrivare nella nota (scritto in modalità editor, o incollato):
 * senza un descrittore registrato MDXEditor solleverebbe un errore invece di
 * renderizzarlo. Serve quindi un fallback, ma NON CodeMirror: quello pesa
 * ~370 kB gzip e finirebbe anche nel chunk di chi si limita ad aprire la
 * modale di lettura. Per modificarlo resta la modalità editor.
 */
function PlainCodeBlock({ code, language }: CodeBlockEditorProps) {
  return (
    <pre style={preStyle} contentEditable={false} data-language={language || undefined}>
      <code>{code}</code>
    </pre>
  );
}

const preStyle: React.CSSProperties = {
  background: '#f5f5f5',
  border: '1px solid #e0e0e0',
  borderRadius: 6,
  padding: 12,
  overflowX: 'auto',
  fontSize: 13,
  lineHeight: 1.4,
};

/**
 * Plugin che definiscono quali costrutti Markdown vengono riconosciuti.
 *
 * Sono in un modulo condiviso perché scrittura (MarkdownEditorImpl) e lettura
 * (MarkdownViewImpl) devono usare esattamente gli stessi: se divergessero, una
 * tabella scritta nell'editor non verrebbe resa nella modale, e sembrerebbe un
 * problema dei dati invece che di configurazione.
 */
export const contentPlugins = () => [
  headingsPlugin(),
  listsPlugin(),
  quotePlugin(),
  thematicBreakPlugin(),
  linkPlugin(),
  imagePlugin(),
  tablePlugin(),
  codeBlockPlugin({
    codeBlockEditorDescriptors: [{ priority: 0, match: () => true, Editor: PlainCodeBlock }],
  }),
];

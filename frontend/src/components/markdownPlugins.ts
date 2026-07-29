import {
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  linkPlugin,
  imagePlugin,
  tablePlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
} from '@mdxeditor/editor';

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
  codeBlockPlugin({ defaultCodeBlockLanguage: '' }),
  codeMirrorPlugin({ codeBlockLanguages: { '': 'Testo', bash: 'Bash', sql: 'SQL' } }),
];

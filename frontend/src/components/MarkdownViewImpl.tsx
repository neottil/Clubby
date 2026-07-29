/**
 * Rendering in sola lettura di una nota Markdown.
 *
 * Modulo separato da MarkdownEditorImpl apposta: la modale di lettura la
 * aprono anche i viewer, e tenendo qui solo i plugin di contenuto il chunk
 * scaricato non contiene né la toolbar né l'editor sorgente. I plugin sono
 * gli stessi usati in scrittura (markdownPlugins.ts), quindi il rendering non
 * può divergere.
 */
import { MDXEditor } from '@mdxeditor/editor';
import { contentPlugins } from './markdownPlugins';
import '@mdxeditor/editor/style.css';

export default function MarkdownViewImpl({ markdown }: { markdown: string }) {
  return (
    <MDXEditor
      markdown={markdown}
      readOnly
      contentEditableClassName='cm-markdown-view'
      plugins={contentPlugins()}
    />
  );
}

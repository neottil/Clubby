/**
 * Editor Markdown con barra dei comandi e switch visuale/editor.
 *
 * Isolato in un modulo a sé perché è caricato solo via React.lazy (vedi
 * MarkdownEditor.tsx): tutta la libreria finisce così in un chunk separato,
 * che scarica soltanto chi apre davvero il form di un incontro.
 */
import {
  MDXEditor,
  markdownShortcutPlugin,
  linkDialogPlugin,
  toolbarPlugin,
  diffSourcePlugin,
  UndoRedo,
  Separator,
  BoldItalicUnderlineToggles,
  StrikeThroughSupSubToggles,
  BlockTypeSelect,
  ListsToggle,
  InsertTable,
  InsertCodeBlock,
  CreateLink,
  InsertImage,
  DiffSourceToggleWrapper,
} from '@mdxeditor/editor';
import { contentPlugins } from './markdownPlugins';
import '@mdxeditor/editor/style.css';

export interface MarkdownEditorImplProps {
  markdown: string;
  onChange: (markdown: string) => void;
}

export default function MarkdownEditorImpl({ markdown, onChange }: MarkdownEditorImplProps) {
  return (
    <MDXEditor
      markdown={markdown}
      onChange={onChange}
      contentEditableClassName='cm-markdown-editor'
      plugins={[
        ...contentPlugins(),
        linkDialogPlugin(),
        // Abilita le scorciatoie di sintassi in modalità visuale: scrivere
        // "**testo**" o "- " produce direttamente il formato corrispondente.
        markdownShortcutPlugin(),
        // Fornisce lo switch visuale/editor. Solo questi due modi: la terza
        // vista ("diff") confronta con una revisione precedente, che qui non
        // esiste.
        diffSourcePlugin({ viewMode: 'rich-text' }),
        toolbarPlugin({
          toolbarContents: () => (
            <DiffSourceToggleWrapper options={['rich-text', 'source']}>
              <UndoRedo />
              <Separator />
              {/* Underline escluso: non esiste in Markdown, il bottone
                  produrrebbe HTML grezzo dentro la nota. */}
              <BoldItalicUnderlineToggles options={['Bold', 'Italic']} />
              <StrikeThroughSupSubToggles options={['Strikethrough']} />
              <Separator />
              {/* Titoli e citazione stanno qui dentro: MDXEditor non espone
                  un bottone "quote" separato. */}
              <BlockTypeSelect />
              <ListsToggle options={['bullet', 'number']} />
              <Separator />
              <InsertTable />
              <InsertCodeBlock />
              <CreateLink />
              <InsertImage />
            </DiffSourceToggleWrapper>
          ),
        }),
      ]}
    />
  );
}

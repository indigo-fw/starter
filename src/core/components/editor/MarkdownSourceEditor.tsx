'use client';

import { useMemo } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { LanguageDescription } from '@codemirror/language';
import { EditorView } from '@codemirror/view';

import { indigoCodeMirrorTheme } from './codemirror-theme';

interface MarkdownSourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Forwarded so the parent can dispatch transactions (insert, replace, focus). */
  editorRef?: React.RefObject<ReactCodeMirrorRef | null>;
}

/**
 * CodeMirror 6 source editor for markdown + embedded HTML + Tailwind class
 * authoring. Used as the "Source" tab in the CMS RichTextEditor in place of
 * a plain textarea.
 *
 * Theme: `indigoCodeMirrorTheme` consumes the design-token CSS variables
 * (`--surface-secondary`, `--text-primary`, `--color-brand-500`, etc.) so
 * light/dark mode follows `html.dark` automatically — no JS subscription
 * to the theme store needed.
 */
export function MarkdownSourceEditor({
  value,
  onChange,
  placeholder,
  className,
  editorRef,
}: MarkdownSourceEditorProps) {
  // Stable extensions array — recreating it would re-mount the EditorView
  // and lose cursor / scroll / undo state on every render.
  const extensions = useMemo(
    () => [
      markdown({
        base: markdownLanguage,
        // Highlight ```html / ```css / ```js fenced code blocks.
        // Inline HTML in markdown body is auto-highlighted by lang-markdown.
        codeLanguages: [
          LanguageDescription.of({
            name: 'html',
            alias: ['htm'],
            load: () => Promise.resolve(html()),
          }),
        ],
      }),
      EditorView.lineWrapping,
      ...indigoCodeMirrorTheme,
    ],
    [],
  );

  return (
    <CodeMirror
      ref={editorRef}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      extensions={extensions}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        bracketMatching: true,
        autocompletion: true,
        searchKeymap: true,
        tabSize: 2,
      }}
      className={className}
      height="100%"
    />
  );
}

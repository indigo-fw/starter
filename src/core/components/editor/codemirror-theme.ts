import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * CodeMirror theme that consumes indigo's design tokens, so syntax-highlighted
 * markdown source flows light/dark automatically with the rest of the admin
 * (no need to swap themes when `html.dark` toggles — CSS vars resolve at
 * render time).
 *
 * Pairs with the markdown + lang-html extensions in `MarkdownSourceEditor`.
 */
const editorChrome = EditorView.theme({
  '&': {
    backgroundColor: 'var(--surface-secondary)',
    color: 'var(--text-primary)',
    height: '100%',
    fontSize: '13px',
  },
  '.cm-content': {
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    caretColor: 'var(--color-brand-500)',
    padding: '12px 0',
  },
  '.cm-scroller': {
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    lineHeight: '1.6',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--color-brand-500)',
    borderLeftWidth: '2px',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    {
      backgroundColor: 'oklch(from var(--color-brand-500) l c h / 0.25)',
    },
  '.cm-activeLine': {
    backgroundColor: 'oklch(from var(--color-brand-500) l c h / 0.06)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--surface-inset)',
    color: 'var(--text-muted)',
    border: 'none',
    borderRight: '1px solid var(--border-primary)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'oklch(from var(--color-brand-500) l c h / 0.08)',
    color: 'var(--text-secondary)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--surface-inset)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-primary)',
    borderRadius: '3px',
    padding: '0 4px',
    margin: '0 2px',
  },
  '.cm-matchingBracket, .cm-nonmatchingBracket': {
    backgroundColor: 'oklch(from var(--color-brand-500) l c h / 0.18)',
    outline: '1px solid oklch(from var(--color-brand-500) l c h / 0.4)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'oklch(from var(--color-warning-500) l c h / 0.3)',
    outline: '1px solid var(--color-warning-500)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'oklch(from var(--color-warning-500) l c h / 0.5)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--surface-elevated)',
    color: 'var(--text-primary)',
    borderTop: '1px solid var(--border-primary)',
  },
  '.cm-panels input, .cm-panels button': {
    backgroundColor: 'var(--surface-secondary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-primary)',
    borderRadius: '3px',
    padding: '2px 6px',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface-elevated)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-primary)',
    borderRadius: '4px',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'oklch(from var(--color-brand-500) l c h / 0.18)',
    color: 'var(--text-primary)',
  },
});

const syntax = HighlightStyle.define([
  // Markdown: headings
  {
    tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6],
    color: 'var(--color-brand-500)',
    fontWeight: '700',
  },
  // Markdown: emphasis / strong
  { tag: t.strong, color: 'var(--text-primary)', fontWeight: '700' },
  { tag: t.emphasis, color: 'var(--text-secondary)', fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  // Markdown: links
  { tag: t.link, color: 'var(--color-brand-500)', textDecoration: 'underline' },
  { tag: t.url, color: 'var(--text-muted)' },
  // Markdown / code: monospace tokens
  { tag: t.monospace, color: 'var(--color-accent-500)' },
  // HTML tags + attributes (also used for markdown's embedded HTML)
  { tag: [t.tagName, t.angleBracket], color: 'var(--color-brand-600)' },
  { tag: t.attributeName, color: 'var(--color-accent-500)' },
  { tag: [t.attributeValue, t.string], color: 'var(--color-success-500)' },
  // Comments + meta
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: t.meta, color: 'var(--text-muted)' },
  // Generic code tokens (for fenced code blocks)
  { tag: t.keyword, color: 'var(--color-brand-500)', fontWeight: '600' },
  { tag: t.number, color: 'var(--color-warning-600)' },
  { tag: [t.bool, t.null, t.atom], color: 'var(--color-warning-600)' },
  { tag: [t.variableName, t.propertyName], color: 'var(--text-primary)' },
  { tag: [t.typeName, t.className], color: 'var(--color-accent-600)' },
  { tag: [t.operator, t.punctuation, t.bracket], color: 'var(--text-secondary)' },
  { tag: t.invalid, color: 'var(--color-danger-500)' },
  // Markdown formatting marks (#, *, [], etc.) — keep visible but de-emphasized
  { tag: t.processingInstruction, color: 'var(--text-muted)' },
  { tag: t.contentSeparator, color: 'var(--border-primary)' },
]);

export const indigoCodeMirrorTheme = [editorChrome, syntaxHighlighting(syntax)];

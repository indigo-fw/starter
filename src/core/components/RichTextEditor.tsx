'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Code2,
  Minus,
  Blocks,
  FileSearch,
  Table as TableIcon,
  PanelRightOpen,
  PanelRightClose,
  Braces,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAdminTranslations } from '@/core/lib/i18n/translations';
import { htmlToMarkdown, markdownToHtml } from '@/core/lib/markdown/markdown';
import { trpc } from '@/lib/trpc/client';
import { toast } from '@/core/store/toast-store';
import { usePrompt } from '@/core/hooks';
import type { EditorHandle } from '@/core/hooks/useLinkPicker';
import type { ShortcodeConfig } from '@/core/types/shortcodes';
import { ContentVariableNode, prepareVarsForEditor, serializeVarsForStorage } from './editor/ContentVariableNode';
import { ResizableImage } from './editor/ResizableImage';
import { DragHandle } from './editor/DragHandle';
import { createSlashCommandExtension } from './editor/slash-commands';
import type { SlashCommandItem } from './editor/slash-commands';
import { createSlashCommandRender } from './editor/slash-command-renderer';
import { EditorBubbleMenu } from './editor/EditorBubbleMenu';
import { ImageBubbleMenu } from './editor/ImageBubbleMenu';
import { TableMenu } from './editor/TableMenu';
import { AiAssistMenu } from './editor/AiAssistMenu';
import { LivePreview } from './editor/LivePreview';

import './editor/editor-styles.css';

interface Props {
  content: string;
  onChange: (value: string) => void;
  placeholder?: string;
  postId?: string;
  height?: string;
  storageKey?: string;
  onRequestLinkPicker?: () => void;
  editorRef?: React.RefObject<EditorHandle | null>;
  /** Optional shortcode integration (dropdown, Tiptap extension, transforms) */
  shortcodes?: ShortcodeConfig;
  /** Callback for AI text transformation. When provided, enables AI assist. */
  onAiTransform?: (text: string, instruction: string) => Promise<string>;
  /** Additional CSS class for the outer wrapper (e.g. to remove rounding when embedded) */
  wrapperClassName?: string;
  /** Called when user wants to replace an image via media picker. Receives callback to set the new URL. */
  onRequestMediaPicker?: (onSelect: (url: string, alt?: string) => void) => void;
}

const HEIGHT_STORAGE_PREFIX = 'cms-editor-h:';

async function uploadImage(file: File, postId?: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  if (postId) formData.append('postId', postId);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? 'Upload failed');
  }
  const data = await res.json() as { url: string };
  return data.url;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'rounded p-1.5 transition-colors',
        active
          ? 'bg-brand-50 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.15)] text-brand-700 dark:text-brand-400'
          : 'text-(--text-secondary) hover:bg-(--surface-secondary) hover:text-(--text-primary)',
        disabled && 'cursor-not-allowed opacity-30'
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-1 h-6 w-px bg-(--border-primary)" />;
}

const identity = (html: string) => html;

/** Serialize editor HTML to markdown, handling shortcodes and content variables. */
function editorToMarkdown(html: string, scSerialize: (html: string) => string): string {
  return htmlToMarkdown(serializeVarsForStorage(scSerialize(html)));
}

export function RichTextEditor({
  content,
  onChange,
  placeholder,
  postId,
  height,
  storageKey,
  onRequestLinkPicker,
  editorRef,
  shortcodes,
  onAiTransform,
  wrapperClassName,
  onRequestMediaPicker,
}: Props) {
  const scPrepareRef = useRef(shortcodes?.prepareForEditor ?? identity);
  const scSerializeRef = useRef(shortcodes?.serializeForStorage ?? identity);
  useEffect(() => {
    scPrepareRef.current = shortcodes?.prepareForEditor ?? identity;
    scSerializeRef.current = shortcodes?.serializeForStorage ?? identity;
  });
  const __ = useAdminTranslations();
  const prompt = usePrompt();
  const [shortcodeMenuOpen, setShortcodeMenuOpen] = useState(false);
  const [varsMenuOpen, setVarsMenuOpen] = useState(false);
  const { data: contentVarDefs } = trpc.cms.contentVars.useQuery(undefined, { staleTime: 60_000 });
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewMarkdown, setPreviewMarkdown] = useState(content);
  const [mode, setMode] = useState<'wysiwyg' | 'source'>(() => {
    try {
      return localStorage.getItem('cms-editor-mode') === 'source'
        ? 'source'
        : 'wysiwyg';
    } catch {
      return 'wysiwyg';
    }
  });
  const [sourceValue, setSourceValue] = useState(content);
  const lastEmittedContent = useRef(content);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });
  const showPreviewRef = useRef(showPreview);
  useEffect(() => { showPreviewRef.current = showPreview; });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);
  const reactId = useId();
  const editorIdRef = useRef(`editor-${reactId.replace(/:/g, '')}`);
  const [editorHeight, setEditorHeight] = useState(height ?? '400px');
  const heightInitialized = useRef(false);

  // Clear pending debounce on unmount (editor may already be destroyed)
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  // Listen for slash command image insert events (scoped to this editor instance)
  useEffect(() => {
    const eventName = `editor:insert-image:${editorIdRef.current}`;
    function handleInsertImage() {
      imageInputRef.current?.click();
    }
    document.addEventListener(eventName, handleInsertImage);
    return () => document.removeEventListener(eventName, handleInsertImage);
  }, []);

  // Height persistence — restore from localStorage on mount (client only)
  useEffect(() => {
    if (!storageKey || heightInitialized.current) return;
    heightInitialized.current = true;
    const saved = localStorage.getItem(HEIGHT_STORAGE_PREFIX + storageKey);
    if (saved) setEditorHeight(saved);
  }, [storageKey]);

  // Custom resize handle — drag to resize editor height
  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const startY = e.clientY;
    const startH = wrapper.offsetHeight;

    function onPointerMove(ev: PointerEvent) {
      const newH = Math.max(200, startH + ev.clientY - startY);
      const val = `${newH}px`;
      wrapper!.style.height = val;
      setEditorHeight(val);
    }
    function onPointerUp() {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      // Persist
      const h = wrapper!.offsetHeight;
      if (h > 0 && storageKey) {
        localStorage.setItem(HEIGHT_STORAGE_PREFIX + storageKey, `${h}px`);
      }
    }
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }, [storageKey]);

  // Build slash command render function (stable ref)
  const slashCommandRenderRef = useRef<ReturnType<typeof createSlashCommandRender> | null>(null);
  // eslint-disable-next-line react-hooks/refs -- lazy init pattern: ref is only set once
  if (!slashCommandRenderRef.current) {
    slashCommandRenderRef.current = createSlashCommandRender();
  }

  // Build extra slash items from shortcodes
  const extraSlashItems: SlashCommandItem[] = shortcodes?.registry.map((sc) => ({
    title: sc.label,
    description: `${__('Insert')} ${sc.label}`,
    icon: 'blocks',
    group: __('Shortcodes'),
    command: ({ editor: e, range }) => {
      const defaultAttrs: Record<string, string> = {};
      for (const attr of sc.attrs) {
        if (attr.default) defaultAttrs[attr.name] = attr.default;
      }
      e.chain().focus().deleteRange(range).insertContent({
        type: 'shortcode',
        attrs: {
          shortcodeName: sc.name,
          shortcodeAttrs: JSON.stringify(defaultAttrs),
          shortcodeContent: '',
        },
      }).run();
    },
  })) ?? [];

  /* eslint-disable react-hooks/refs -- useEditor config reads stable refs for initial setup */
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
        underline: false,
        dropcursor: {
          color: 'oklch(0.65 0.25 var(--brand-hue, 350))',
          width: 3,
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer' },
      }),
      ResizableImage.configure({
        HTMLAttributes: { class: 'rounded-lg max-w-full' },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: placeholder ?? __('Start writing or type / for commands...'),
      }),
      // Table support
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: 'editor-table' },
      }),
      TableRow,
      TableHeader,
      TableCell,
      // Drag handles for block reordering
      DragHandle,
      // Slash commands
      createSlashCommandExtension(__, extraSlashItems, editorIdRef.current).configure({
        suggestion: {
          render: slashCommandRenderRef.current!,
        },
      }),
      ...(shortcodes?.extension ? [shortcodes.extension] : []),
      ContentVariableNode,
    ],
    content: prepareVarsForEditor(scPrepareRef.current(markdownToHtml(content))),
    onUpdate: ({ editor: e }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (showPreviewRef.current) {
        // Preview open: convert immediately for live preview, reuse for debounced form update
        const md = editorToMarkdown(e.getHTML(), scSerializeRef.current);
        setPreviewMarkdown(md);
        lastEmittedContent.current = md;
        // Debounce only the parent onChange (to avoid excessive form re-renders)
        debounceRef.current = setTimeout(() => {
          onChangeRef.current(lastEmittedContent.current);
        }, 300);
      } else {
        // No preview: defer everything to debounce
        debounceRef.current = setTimeout(() => {
          const md = editorToMarkdown(e.getHTML(), scSerializeRef.current);
          lastEmittedContent.current = md;
          onChangeRef.current(md);
        }, 300);
      }
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px] px-4 py-3',
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              uploadImage(file, postId).then((url) => {
                editor?.chain().focus().setImage({ src: url }).run();
              }).catch((err: unknown) => {
                toast.error(err instanceof Error ? err.message : __('Image upload failed'));
              });
            }
            return true;
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = (event as DragEvent).dataTransfer?.files;
        if (!files?.length) return false;
        for (const file of files) {
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            uploadImage(file, postId).then((url) => {
              editor?.chain().focus().setImage({ src: url }).run();
            }).catch((err: unknown) => {
              toast.error(err instanceof Error ? err.message : __('Image upload failed'));
            });
            return true;
          }
        }
        return false;
      },
    },
  });
  /* eslint-enable react-hooks/refs */

  // Sync content from parent when it changes externally (e.g. autosave restore)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (content === lastEmittedContent.current) return;
    lastEmittedContent.current = content;
    if (mode === 'source') setSourceValue(content);
    setPreviewMarkdown(content);
    editor.commands.setContent(prepareVarsForEditor(scPrepareRef.current(markdownToHtml(content))), {
      emitUpdate: false,
    });
  }, [editor, content, mode]);

  // EditorHandle — expose replaceSelection to parent via editorRef
  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = {
      replaceSelection: (text: string) => {
        if (mode === 'source') {
          const textarea = sourceTextareaRef.current;
          if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const val = textarea.value;
            const newValue = val.slice(0, start) + text + val.slice(end);
            setSourceValue(newValue);
            onChangeRef.current(newValue);
            requestAnimationFrame(() => {
              textarea.selectionStart = textarea.selectionEnd = start + text.length;
              textarea.focus();
            });
          }
        } else if (editor) {
          const linkMatch = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          if (linkMatch) {
            const [, title, url] = linkMatch;
            editor.chain().focus().insertContent({
              type: 'text',
              marks: [{ type: 'link', attrs: { href: url } }],
              text: title,
            }).run();
          } else {
            editor.chain().focus().insertContent(text).run();
          }
        }
      },
      insertImage: (src: string, alt?: string) => {
        if (mode === 'source') {
          const md = alt ? `![${alt}](${src})` : `![](${src})`;
          const textarea = sourceTextareaRef.current;
          if (textarea) {
            const start = textarea.selectionStart;
            const val = textarea.value;
            const newValue = val.slice(0, start) + md + val.slice(start);
            setSourceValue(newValue);
            onChangeRef.current(newValue);
          }
        } else if (editor) {
          editor.chain().focus().setImage({ src, alt: alt ?? '' }).run();
        }
      },
    };
    return () => {
      if (editorRef) editorRef.current = null;
    };
  }, [editor, editorRef, mode]);

  const toggleMode = useCallback(() => {
    if (!editor) return;
    if (mode === 'wysiwyg') {
      // Flush any pending debounced update before reading HTML
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const md = editorToMarkdown(editor.getHTML(), scSerializeRef.current);
      setSourceValue(md);
      lastEmittedContent.current = md;
      onChangeRef.current(md);
      setMode('source');
      try { localStorage.setItem('cms-editor-mode', 'source'); } catch { /* quota */ }
    } else {
      // Source → WYSIWYG: suppress emitUpdate to avoid double-fire
      editor.commands.setContent(prepareVarsForEditor(scPrepareRef.current(markdownToHtml(sourceValue))), {
        emitUpdate: false,
      });
      const md = editorToMarkdown(editor.getHTML(), scSerializeRef.current);
      lastEmittedContent.current = md;
      onChangeRef.current(md);
      setMode('wysiwyg');
      try { localStorage.setItem('cms-editor-mode', 'wysiwyg'); } catch { /* quota */ }
    }
  }, [editor, mode, sourceValue]);

  if (!editor) return null;

  async function addLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = await prompt({ title: __('URL'), defaultValue: previousUrl ?? 'https://', placeholder: 'https://' });
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  const iconSize = 'h-4 w-4';

  // Sync preview content when source mode changes or preview toggled on
  const previewContent = mode === 'source' ? sourceValue : previewMarkdown;

  return (
    <div className={cn(showPreview && 'editor-preview-split')}>
      {/* Editor */}
      <div
        ref={wrapperRef}
        style={{ height: editorHeight, overflow: 'hidden' }}
        className={cn(
          'relative flex flex-col overflow-hidden rounded-md border border-(--border-primary) focus-within:border-accent-500 focus-within:ring-1 focus-within:ring-accent-500',
          wrapperClassName,
        )}
      >
        {/* Toolbar — disabled in source mode to prevent modifying the hidden editor */}
        <div className={cn(
          'editor-toolbar flex flex-wrap items-center gap-0.5 border-b border-(--border-primary) bg-(--surface-inset) px-2 py-1.5 shrink-0',
          mode === 'source' && 'pointer-events-none opacity-40',
        )}>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title={__('Bold')}
          >
            <Bold className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title={__('Italic')}
          >
            <Italic className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')}
            title={__('Underline')}
          >
            <UnderlineIcon className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            title={__('Strikethrough')}
          >
            <Strikethrough className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive('code')}
            title={__('Inline Code')}
          >
            <Code className={iconSize} />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            title={__('Heading 1')}
          >
            <Heading1 className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            title={__('Heading 2')}
          >
            <Heading2 className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            title={__('Heading 3')}
          >
            <Heading3 className={iconSize} />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title={__('Bullet List')}
          >
            <List className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title={__('Ordered List')}
          >
            <ListOrdered className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive('blockquote')}
            title={__('Quote')}
          >
            <Quote className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            active={editor.isActive('codeBlock')}
            title={__('Code Block')}
          >
            <Code2 className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title={__('Horizontal Rule')}
          >
            <Minus className={iconSize} />
          </ToolbarButton>

          <ToolbarDivider />

          {/* Table insert */}
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            active={editor.isActive('table')}
            title={__('Insert Table')}
          >
            <TableIcon className={iconSize} />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            active={editor.isActive({ textAlign: 'left' })}
            title={__('Align Left')}
          >
            <AlignLeft className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            active={editor.isActive({ textAlign: 'center' })}
            title={__('Align Center')}
          >
            <AlignCenter className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            active={editor.isActive({ textAlign: 'right' })}
            title={__('Align Right')}
          >
            <AlignRight className={iconSize} />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={addLink}
            active={editor.isActive('link')}
            title={__('Link')}
          >
            <LinkIcon className={iconSize} />
          </ToolbarButton>
          {onRequestLinkPicker && (
            <ToolbarButton onClick={onRequestLinkPicker} title={__('Internal Link')} active={false}>
              <FileSearch size={18} />
            </ToolbarButton>
          )}
          <ToolbarButton onClick={() => imageInputRef.current?.click()} title={__('Image')}>
            <ImageIcon className={iconSize} />
          </ToolbarButton>

          <ToolbarDivider />

          {/* Content variables dropdown — inserts [[VAR]] placeholders */}
          {contentVarDefs && contentVarDefs.length > 0 && (
            <div className="editor-toolbar-menu relative">
              <ToolbarButton
                onClick={() => { setVarsMenuOpen(!varsMenuOpen); setShortcodeMenuOpen(false); }}
                title={__('Insert Variable')}
              >
                <Braces className={iconSize} />
              </ToolbarButton>
              {varsMenuOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 w-52 rounded-md border border-(--border-primary) bg-(--surface-primary) py-1 shadow-lg">
                  {contentVarDefs.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-(--text-secondary) hover:bg-(--surface-secondary)"
                      title={v.value}
                      onClick={() => {
                        if (!editor) return;
                        editor.chain().focus().insertContent({
                          type: 'contentVariable',
                          attrs: { variableName: v.key },
                        }).run();
                        setVarsMenuOpen(false);
                      }}
                    >
                      <span>{__(v.label)}</span>
                      <span className="max-w-24 truncate text-xs text-(--text-muted)">{v.value}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <ToolbarDivider />

          {/* Shortcode insert dropdown (only shown when shortcodes config provided) */}
          {shortcodes && shortcodes.registry.length > 0 && (
            <>
              <div className="editor-toolbar-menu relative">
                <ToolbarButton
                  onClick={() => { setShortcodeMenuOpen(!shortcodeMenuOpen); setVarsMenuOpen(false); }}
                  title={__('Insert Block')}
                >
                  <Blocks className={iconSize} />
                </ToolbarButton>
                {shortcodeMenuOpen && (
                  <div className="editor-shortcode-menu absolute left-0 top-full z-10 mt-1 w-40 rounded-md border border-(--border-primary) bg-(--surface-primary) py-1 shadow-lg">
                    {shortcodes.registry.map((sc) => (
                      <button
                        key={sc.name}
                        type="button"
                        className="block w-full px-3 py-1.5 text-left text-sm text-(--text-secondary) hover:bg-(--surface-secondary)"
                        onClick={() => {
                          if (!editor) return;
                          const defaultAttrs: Record<string, string> = {};
                          for (const attr of sc.attrs) {
                            if (attr.default) defaultAttrs[attr.name] = attr.default;
                          }
                          editor
                            .chain()
                            .focus()
                            .insertContent({
                              type: 'shortcode',
                              attrs: {
                                shortcodeName: sc.name,
                                shortcodeAttrs: JSON.stringify(defaultAttrs),
                                shortcodeContent: '',
                              },
                            })
                            .run();
                          setShortcodeMenuOpen(false);
                        }}
                      >
                        {__(sc.label)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <ToolbarDivider />
            </>
          )}

          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title={__('Undo')}
          >
            <Undo className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title={__('Redo')}
          >
            <Redo className={iconSize} />
          </ToolbarButton>

          {/* Spacer + Preview toggle */}
          <div className="ml-auto" />
          <ToolbarButton
            onClick={() => {
              if (!showPreview && editor && mode === 'wysiwyg') {
                // Sync preview with current editor content when toggling on
                setPreviewMarkdown(editorToMarkdown(editor.getHTML(), scSerializeRef.current));
              }
              setShowPreview(!showPreview);
            }}
            active={showPreview}
            title={showPreview ? __('Hide Preview') : __('Show Preview')}
          >
            {showPreview ? (
              <PanelRightClose className={iconSize} />
            ) : (
              <PanelRightOpen className={iconSize} />
            )}
          </ToolbarButton>
        </div>

        {/* Hidden file input for image upload */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file || !editor) return;
            e.target.value = '';
            try {
              const url = await uploadImage(file, postId);
              editor.chain().focus().setImage({ src: url }).run();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : __('Image upload failed'));
            }
          }}
        />

        {/* Editor / Source */}
        <div className={cn('editor-content flex-1 bg-(--surface-secondary)', mode === 'wysiwyg' ? 'overflow-auto' : 'overflow-hidden')}>
          {mode === 'wysiwyg' ? (
            <EditorContent
              editor={editor}
              className="h-full"
            />
          ) : (
            <textarea
              ref={sourceTextareaRef}
              value={sourceValue}
              onChange={(e) => {
                setSourceValue(e.target.value);
                lastEmittedContent.current = e.target.value;
                onChangeRef.current(e.target.value);
              }}
              className="tiptap-source-textarea h-full w-full resize-none border-none bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed text-inherit outline-none"
              style={{ tabSize: 2 }}
            />
          )}
        </div>

        {/* Floating toolbar on text selection */}
        {mode === 'wysiwyg' && (
          <>
            <EditorBubbleMenu
              editor={editor}
              __={__}
              onAddLink={addLink}
              onAiAssist={onAiTransform ? () => setAiAssistOpen(true) : undefined}
            />
            <TableMenu editor={editor} __={__} />
            <ImageBubbleMenu
              editor={editor}
              __={__}
              onReplace={() => {
                if (onRequestMediaPicker) {
                  onRequestMediaPicker((url, alt) => {
                    editor.chain().focus().updateAttributes('image', {
                      src: url,
                      ...(alt ? { alt } : {}),
                    }).run();
                  });
                }
              }}
            />
          </>
        )}

        {/* AI Assist floating menu */}
        {mode === 'wysiwyg' && onAiTransform && (
          <AiAssistMenu
            editor={editor}
            __={__}
            open={aiAssistOpen}
            onClose={() => setAiAssistOpen(false)}
            onSubmit={onAiTransform}
          />
        )}

        {/* Mode tabs (bottom) */}
        <div className="editor-mode-tabs flex justify-end border-t border-(--border-primary) bg-(--surface-secondary) shrink-0">
          <button
            type="button"
            className={cn(
              '-mt-px border-t-2 px-4 py-1.5 text-[13px] transition-colors',
              mode === 'wysiwyg'
                ? 'border-brand-500 text-brand-500 dark:border-brand-400 dark:text-brand-400 bg-(--surface-primary)'
                : 'border-transparent text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--surface-primary)',
            )}
            onClick={() => mode !== 'wysiwyg' && toggleMode()}
          >
            {__('Visual')}
          </button>
          <button
            type="button"
            className={cn(
              '-mt-px border-t-2 px-4 py-1.5 text-[13px] transition-colors',
              mode === 'source'
                ? 'border-brand-500 text-brand-500 dark:border-brand-400 dark:text-brand-400 bg-(--surface-primary)'
                : 'border-transparent text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--surface-primary)',
            )}
            onClick={() => mode !== 'source' && toggleMode()}
          >
            {__('Source')}
          </button>
        </div>

        {/* Resize handle */}
        <div
          onPointerDown={handleResizePointerDown}
          className="shrink-0 flex items-center justify-center h-2 cursor-row-resize bg-(--surface-inset) hover:bg-brand-500/20 transition-colors border-t border-(--border-primary) select-none"
        >
          <div className="w-8 h-0.5 rounded-full bg-(--text-muted)/60" />
        </div>
      </div>

      {/* Live Preview Panel */}
      {showPreview && (
        <div className="rounded-md border border-(--border-primary) overflow-auto" style={{ height: editorHeight }}>
          <div className="border-b border-(--border-primary) px-3 py-2 text-xs font-medium text-(--text-muted) uppercase tracking-wider">
            {__('Preview')}
          </div>
          <LivePreview
            content={previewContent}
            className="prose prose-sm dark:prose-invert max-w-none px-4 py-3"
          />
        </div>
      )}
    </div>
  );
}

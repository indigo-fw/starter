import type { ComponentType } from 'react';
import type { AnyExtension } from '@tiptap/react';

export interface ShortcodeAttrDef {
  name: string;
  type: 'text' | 'select' | 'textarea';
  default?: string;
  options?: string[];
}

export interface ShortcodeDef {
  name: string;
  label: string;
  icon: string;
  hasContent: boolean;
  attrs: ShortcodeAttrDef[];
  component?: ComponentType<{ attrs: Record<string, string>; content?: string }>;
}

/** Optional shortcode integration for RichTextEditor */
export interface ShortcodeConfig {
  /** Shortcode definitions for the insert dropdown */
  registry: ShortcodeDef[];
  /** Tiptap extension or node for rendering shortcodes */
  extension: AnyExtension;
  /** Transform shortcode syntax to editor HTML before loading */
  prepareForEditor: (html: string) => string;
  /** Transform editor HTML back to shortcode syntax before saving */
  serializeForStorage: (html: string) => string;
}

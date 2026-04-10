import type { ShortcodeConfig } from '@/core/types/shortcodes';
import { SHORTCODE_REGISTRY } from '@/lib/shortcodes/registry';
import { ShortcodeNode } from '@/components/admin/shortcodes/ShortcodeNode';
import { prepareForEditor, serializeForStorage } from '@/core/lib/markdown/shortcode-utils';

/** Project-level shortcode config for RichTextEditor */
export const shortcodeConfig: ShortcodeConfig = {
  registry: SHORTCODE_REGISTRY,
  extension: ShortcodeNode,
  prepareForEditor,
  serializeForStorage,
};

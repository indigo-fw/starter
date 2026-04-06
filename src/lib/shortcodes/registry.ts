import type { ShortcodeDef } from '@/core/types/shortcodes';

export type { ShortcodeAttrDef, ShortcodeDef } from '@/core/types/shortcodes';

export const SHORTCODE_REGISTRY: ShortcodeDef[] = [
  {
    name: 'callout',
    label: 'Callout',
    icon: 'info',
    hasContent: true,
    attrs: [
      {
        name: 'type',
        type: 'select',
        default: 'info',
        options: ['info', 'warning', 'success', 'error'],
      },
    ],
  },
  {
    name: 'cta',
    label: 'Call to Action',
    icon: 'mouse-pointer',
    hasContent: false,
    attrs: [
      { name: 'text', type: 'text', default: 'Click here' },
      { name: 'url', type: 'text', default: 'https://' },
      {
        name: 'style',
        type: 'select',
        default: 'primary',
        options: ['primary', 'secondary', 'outline'],
      },
    ],
  },
  {
    name: 'youtube',
    label: 'YouTube Video',
    icon: 'play',
    hasContent: false,
    attrs: [{ name: 'videoId', type: 'text', default: '' }],
  },
  {
    name: 'gallery',
    label: 'Image Gallery',
    icon: 'images',
    hasContent: false,
    attrs: [{ name: 'ids', type: 'text', default: '' }],
  },
];

export function getShortcodeDef(name: string): ShortcodeDef | undefined {
  return SHORTCODE_REGISTRY.find((s) => s.name === name);
}

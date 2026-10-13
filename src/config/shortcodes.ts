import type { ShortcodeComponentMap } from '@/core/components/content/ShortcodeRenderer';
import { CalloutBlock } from '@/core/components/shortcodes/CalloutBlock';
import { CtaBlock } from '@/core/components/shortcodes/CtaBlock';
import { YoutubeEmbed } from '@/core/components/shortcodes/YoutubeEmbed';
import { GalleryBlock } from '@/core/components/shortcodes/GalleryBlock';
import { ImageBlock } from '@/core/components/shortcodes/ImageBlock';

/**
 * Project-level shortcode component registry.
 * To add a custom shortcode: import the component and add it here.
 */
export const SHORTCODE_COMPONENTS: ShortcodeComponentMap = {
  callout: CalloutBlock,
  cta: CtaBlock,
  youtube: YoutubeEmbed,
  gallery: GalleryBlock,
  image: ImageBlock,
};

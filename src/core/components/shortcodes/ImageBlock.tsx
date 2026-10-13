import { cn } from '@/lib/utils';

/**
 * `[image /]` shortcode - a content image that can link somewhere or sit
 * static. Attrs-only, so it MUST be self-closing (the parser only matches
 * `[name attrs /]` or a paired `[name]...[/name]`):
 *
 *   [image src="cms://asset/en/hero.jpg" alt="Hero" href="/signup" w="1280" h="720" /]
 *
 * `cms://asset/` srcs are already resolved to storage/CDN URLs upstream
 * (resolveRecordAssetUris runs on the whole content string before the
 * shortcode parser sees it), so `src` always arrives as a plain URL.
 *
 * Attrs:
 *   src      required - image URL
 *   alt      alt text
 *   caption  optional caption rendered under the image
 *   href     optional - wraps the image in a link (e.g. "/signup")
 *   target   optional link target (e.g. "_blank"); only used with href
 *   width    optional max display width in px (e.g. "480" for a phone shot)
 *   w, h     optional intrinsic pixel size -> reserves aspect ratio (no CLS)
 *
 * Uses a plain <img> (not next/image): shortcode images come from arbitrary
 * storage/CDN hosts and would each need a remotePatterns entry.
 */

interface Props {
  attrs: Record<string, string>;
}

function isSafeUrl(url: string): boolean {
  return url.startsWith('/') || url.startsWith('https://') || url.startsWith('http://');
}

export function ImageBlock({ attrs }: Props) {
  const src = attrs.src?.trim();
  if (!src || !isSafeUrl(src)) return null;

  const alt = attrs.alt ?? '';
  const caption = attrs.caption?.trim();
  const href = attrs.href?.trim();
  const target = attrs.target?.trim() || undefined;
  const maxWidth = attrs.width ? parseInt(attrs.width, 10) : undefined;
  const w = attrs.w ? parseInt(attrs.w, 10) : undefined;
  const h = attrs.h ? parseInt(attrs.h, 10) : undefined;
  const frameStyle =
    maxWidth && Number.isFinite(maxWidth) ? { maxWidth } : undefined;

  const image = (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary storage/CDN hosts, see docblock
    <img
      src={src}
      alt={alt}
      width={w && Number.isFinite(w) ? w : undefined}
      height={h && Number.isFinite(h) ? h : undefined}
      loading="lazy"
      decoding="async"
      className="block h-auto w-full rounded-lg"
    />
  );

  const frameClass = 'block w-full overflow-hidden rounded-lg';

  return (
    <figure className="image-block my-6 flex flex-col items-center">
      {href && isSafeUrl(href) ? (
        <a
          href={href}
          target={target}
          rel={target === '_blank' ? 'noopener noreferrer' : undefined}
          style={frameStyle}
          aria-label={alt || undefined}
          className={cn(frameClass, 'transition-opacity hover:opacity-90')}
        >
          {image}
        </a>
      ) : (
        <div style={frameStyle} className={frameClass}>
          {image}
        </div>
      )}

      {caption && (
        <figcaption className="mt-2 max-w-2xl text-center text-sm text-(--text-muted)">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

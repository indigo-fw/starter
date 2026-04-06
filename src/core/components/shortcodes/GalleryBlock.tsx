'use client';

import Image from 'next/image';
import { trpc } from '@/lib/trpc/client';

interface Props {
  attrs: Record<string, string>;
}

export function GalleryBlock({ attrs }: Props) {
  const ids = (attrs.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const mediaQuery = trpc.media.getByIds.useQuery(
    { ids },
    { enabled: ids.length > 0 }
  );

  if (ids.length === 0) {
    return (
      <div className="my-4 rounded bg-(--surface-secondary) p-4 text-center text-sm text-(--text-muted)">
        No images in gallery
      </div>
    );
  }

  if (mediaQuery.isLoading) {
    return (
      <div className="my-6 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        {ids.map((id) => (
          <div
            key={id}
            className="aspect-square animate-pulse rounded-md bg-(--surface-secondary)"
          />
        ))}
      </div>
    );
  }

  const media = mediaQuery.data ?? [];

  // Preserve order from attrs
  const mediaMap = new Map(media.map((m) => [m.id, m]));
  const ordered = ids.map((id) => mediaMap.get(id)).filter((m): m is NonNullable<typeof m> => m != null);

  return (
    <div className="gallery my-6 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
      {ordered.map((m) => (
        <div key={m.id} className="gallery-item relative aspect-square overflow-hidden rounded-md bg-(--surface-secondary)">
          <Image
            src={m.mediumUrl ?? m.url}
            alt={m.altText ?? ''}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}

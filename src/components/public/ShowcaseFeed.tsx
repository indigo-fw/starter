'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronDown, ChevronUp, Play } from 'lucide-react';

import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc/client';
import { useSession } from '@/lib/auth-client';
import { ShortcodeRenderer } from '@/core/components/ShortcodeRenderer';
import { SHORTCODE_COMPONENTS } from '@/config/shortcodes';
import { ShowcaseActionBar } from './ShowcaseActionBar';
import { CommentPanel } from './CommentPanel';
import { useTranslations } from '@/lib/translations';

type ShowcaseVariant = 'shorts' | 'contained' | 'full';

interface ShowcaseItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  cardType: string;
  variant: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  sortOrder: number;
}

interface Props {
  items: ShowcaseItem[];
  showNavDots?: boolean;
}

// ── Single source of truth for variant dimensions ────────────────────

const VARIANT_CONFIG = {
  shorts:    { maxWidth: '450px', halfWidth: '225px' },
  contained: { maxWidth: '48rem', halfWidth: '24rem' },
  full:      { maxWidth: undefined, halfWidth: undefined },
} as const;

/**
 * Action bar positioning — uses --card-half CSS var set on the parent.
 * Mobile: absolute inside the card (right-3).
 * Desktop: calc-positioned outside the card's right edge.
 * Shorts breaks out at md (768px+), contained at lg (1024px+).
 */
const barPositionClass: Record<ShowcaseVariant, string> = {
  shorts:    'absolute bottom-24 right-3 z-20 md:right-auto md:left-[calc(50%+var(--card-half)+0.75rem)]',
  contained: 'absolute bottom-24 right-3 z-20 lg:right-auto lg:left-[calc(50%+var(--card-half)+0.75rem)]',
  full:      'absolute bottom-24 right-4 z-20 sm:right-6',
};

/**
 * Overlay right padding.
 * Extra padding when bar overlaps (mobile / full), standard when bar is outside (desktop constrained).
 */
const overlayPadClass: Record<ShowcaseVariant, string> = {
  shorts:    'pr-16 md:pr-6',
  contained: 'pr-16 lg:pr-6',
  full:      'pr-20 sm:pr-24',
};

// ── Helpers ──────────────────────────────────────────────────────────

function parseVideoEmbed(url: string): { provider: 'youtube' | 'vimeo' | 'unknown'; embedUrl: string } {
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    return { provider: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&loop=1&playlist=${ytMatch[1]}` };
  }
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&muted=1&loop=1` };
  }
  return { provider: 'unknown', embedUrl: url };
}

// ── Card sub-components ──────────────────────────────────────────────

function CardOverlay({ title, description, className }: { title: string; description?: string; className?: string }) {
  return (
    <div className={cn(
      'absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-6 pb-8 pt-24 sm:px-10 sm:pb-12',
      className,
    )}>
      <h2 className="text-2xl font-bold leading-tight text-white drop-shadow-lg sm:text-4xl">
        {title}
      </h2>
      {description && (
        <div className="mt-3 line-clamp-3 max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
          <ShortcodeRenderer content={description} components={SHORTCODE_COMPONENTS} />
        </div>
      )}
    </div>
  );
}

function VideoCard({ item, isActive, overlayClassName }: { item: ShowcaseItem; isActive: boolean; overlayClassName?: string }) {
  const video = item.mediaUrl ? parseVideoEmbed(item.mediaUrl) : null;

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      {isActive && video ? (
        <iframe
          src={video.embedUrl}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; encrypted-media"
          allowFullScreen
          title={item.title}
        />
      ) : (
        <div className="relative flex h-full w-full items-center justify-center">
          {item.thumbnailUrl ? (
            <Image
              src={item.thumbnailUrl}
              alt={item.title}
              fill
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-brand-900 to-accent-900" />
          )}
          <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-md transition-transform hover:scale-110">
            <Play className="ml-1 h-10 w-10 text-white" fill="white" />
          </div>
        </div>
      )}
      <CardOverlay title={item.title} description={item.description} className={overlayClassName} />
    </div>
  );
}

function ImageCard({ item, overlayClassName }: { item: ShowcaseItem; overlayClassName?: string }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {item.mediaUrl ? (
        <Image
          src={item.mediaUrl}
          alt={item.title}
          fill
          className="object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-800 to-accent-800" />
      )}
      <div className="absolute inset-0 bg-black/25" />
      <CardOverlay title={item.title} description={item.description} className={overlayClassName} />
    </div>
  );
}

function RichTextCard({ item }: { item: ShowcaseItem }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-950 via-accent-950 to-brand-900 p-6">
      <div className="max-w-2xl text-center">
        <h2 className="text-3xl font-bold leading-tight text-white sm:text-5xl">
          {item.title}
        </h2>
        {item.description && (
          <div className="prose prose-invert mx-auto mt-6 max-w-none prose-p:text-white/80 prose-headings:text-white">
            <ShortcodeRenderer content={item.description} components={SHORTCODE_COMPONENTS} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Feed ──────────────────────────────────────────────────────────────

export function ShowcaseFeed({ items, showNavDots = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [commentPanelId, setCommentPanelId] = useState<string | null>(null);
  const { data: session } = useSession();
  const __ = useTranslations();

  const itemIds = items.map((i) => i.id);

  const { data: reactionCounts } = trpc.reactions.getBatchCounts.useQuery(
    { contentType: 'showcase', contentIds: itemIds },
    { enabled: itemIds.length > 0 }
  );
  const { data: commentCounts } = trpc.comments.batchCounts.useQuery(
    { contentType: 'showcase', contentIds: itemIds },
    { enabled: itemIds.length > 0 }
  );
  const { data: userReactions } = trpc.reactions.getUserBatchReactions.useQuery(
    { contentType: 'showcase', contentIds: itemIds },
    { enabled: itemIds.length > 0 && !!session }
  );

  const scrollToIndex = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const children = container.children;
    if (index >= 0 && index < children.length) {
      children[index]?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!isNaN(idx)) setCurrentIndex(idx);
          }
        }
      },
      { root: container, threshold: 0.6 }
    );

    for (const child of container.children) {
      observer.observe(child);
    }

    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    if (commentPanelId) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollToIndex(Math.min(currentIndex + 1, items.length - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollToIndex(Math.max(currentIndex - 1, 0));
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, items.length, scrollToIndex, commentPanelId]);

  if (items.length === 0) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center">
        <p className="text-(--text-muted)">{__('No showcase items yet.')}</p>
      </div>
    );
  }

  const isPanelOpen = commentPanelId !== null;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={cn(
          'showcase-feed h-[calc(100dvh-3.5rem)] snap-y snap-mandatory overflow-y-scroll transition-[margin-right] duration-300',
          isPanelOpen && 'md:mr-[400px]',
        )}
      >
        {items.map((item, index) => {
          const counts = reactionCounts?.[item.id] ?? { likes: 0, dislikes: 0 };
          const cCount = commentCounts?.[item.id] ?? 0;
          const uReaction = userReactions?.[item.id] ?? null;
          const v = (item.variant || 'full') as ShowcaseVariant;
          const cfg = VARIANT_CONFIG[v];
          const isConstrained = v !== 'full';

          return (
            <div
              key={item.id}
              data-index={index}
              className="relative h-[calc(100dvh-3.5rem)] w-full snap-start snap-always"
              style={cfg.halfWidth ? { '--card-half': cfg.halfWidth } as React.CSSProperties : undefined}
            >
              {/* Card — centered via mx-auto, width from VARIANT_CONFIG */}
              <div
                className="relative mx-auto h-full"
                style={cfg.maxWidth ? { maxWidth: cfg.maxWidth } : undefined}
              >
                {item.cardType === 'video' ? (
                  <VideoCard item={item} isActive={index === currentIndex} overlayClassName={overlayPadClass[v]} />
                ) : item.cardType === 'image' ? (
                  <ImageCard item={item} overlayClassName={overlayPadClass[v]} />
                ) : (
                  <RichTextCard item={item} />
                )}
              </div>

              {/* Action bar — uses --card-half for calc positioning */}
              <div className={barPositionClass[v]}>
                <ShowcaseActionBar
                  itemId={item.id}
                  itemSlug={item.slug}
                  contentType="showcase"
                  likes={counts.likes}
                  dislikes={counts.dislikes}
                  commentCount={cCount}
                  userReaction={uReaction}
                  onCommentClick={() => setCommentPanelId(item.id)}
                  allItemIds={itemIds}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation dots — fixed to left viewport edge */}
      {showNavDots && items.length > 1 && (
        <div className="absolute left-4 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1.5 sm:left-6">
          <button
            onClick={() => scrollToIndex(Math.max(currentIndex - 1, 0))}
            disabled={currentIndex === 0}
            className="rounded-full bg-white/15 p-1.5 text-white backdrop-blur-md transition hover:bg-white/25 disabled:opacity-0"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToIndex(i)}
              className={cn(
                'rounded-full transition-all',
                i === currentIndex
                  ? 'h-2.5 w-2.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]'
                  : 'h-1.5 w-1.5 bg-white/40 hover:bg-white/70'
              )}
            />
          ))}
          <button
            onClick={() => scrollToIndex(Math.min(currentIndex + 1, items.length - 1))}
            disabled={currentIndex === items.length - 1}
            className="rounded-full bg-white/15 p-1.5 text-white backdrop-blur-md transition hover:bg-white/25 disabled:opacity-0"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Comment panel */}
      <CommentPanel
        contentType="showcase"
        contentId={commentPanelId}
        onClose={() => setCommentPanelId(null)}
      />
    </div>
  );
}

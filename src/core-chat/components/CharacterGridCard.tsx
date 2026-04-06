'use client';

import { useRef, useState } from 'react';
import { useBlankTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface CharacterGridCardProps {
  name: string;
  tagline?: string | null;
  featuredImageUrl?: string | null;
  featuredVideoUrl?: string | null;
  avatarUrl?: string | null;
  onClick: () => void;
}

export function CharacterGridCard({
  name, tagline, featuredImageUrl, featuredVideoUrl, avatarUrl, onClick,
}: CharacterGridCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const imageUrl = featuredImageUrl ?? avatarUrl;

  function handleMouseEnter() {
    setIsHovered(true);
    if (featuredVideoUrl && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }

  function handleMouseLeave() {
    setIsHovered(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative overflow-hidden rounded-xl cursor-pointer group aspect-[2/3] bg-(--surface-secondary)"
    >
      {/* Image */}
      {imageUrl && (
        <img
          src={imageUrl}
          alt={name}
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-transform duration-300',
            isHovered && 'scale-105',
          )}
          loading="lazy"
        />
      )}

      {/* Placeholder when no image */}
      {!imageUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-500/20 to-brand-500/5">
          <span className="text-5xl font-bold text-brand-500/30">{name[0]?.toUpperCase()}</span>
        </div>
      )}

      {/* Video overlay on hover — only loads when hovered */}
      {featuredVideoUrl && isHovered && (
        <video
          ref={videoRef}
          src={featuredVideoUrl}
          muted
          loop
          playsInline
          autoPlay
          preload="none"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Gradient overlay at bottom */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />

      {/* Name + tagline */}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <h3 className="text-sm font-semibold text-white">{name}</h3>
        {tagline && (
          <p className="text-xs text-white/70 mt-0.5 line-clamp-2">{tagline}</p>
        )}
      </div>
    </div>
  );
}

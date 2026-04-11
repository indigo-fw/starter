import { cn } from '@/lib/utils';
import './Avatar.css';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  /** Image URL. Falls back to initials if not provided or fails to load. */
  src?: string | null;
  /** User name — used for initials fallback and alt text. */
  name?: string;
  /** Size preset */
  size?: AvatarSize;
  /** Custom pixel size (overrides size preset) */
  sizePx?: number;
  /** Additional CSS class */
  className?: string;
}

const SIZE_MAP: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * User avatar with image + initials fallback.
 *
 * @example
 * <Avatar src={user.image} name={user.name} size="md" />
 * <Avatar name="John Doe" /> // shows "JD"
 */
export function Avatar({
  src,
  name,
  size = 'md',
  sizePx,
  className,
}: AvatarProps) {
  const px = sizePx ?? SIZE_MAP[size];
  const initials = name ? getInitials(name) : '?';
  const fontSize = Math.round(px * 0.4);

  return (
    <div
      className={cn('avatar', className)}
      style={{ width: px, height: px, fontSize }}
      title={name}
    >
      {src ? (
        <img
          src={src}
          alt={name ?? 'Avatar'}
          width={px}
          height={px}
          className="avatar__img"
          onError={(e) => {
            // Hide broken image, show initials
            (e.target as HTMLImageElement).style.display = 'none';
            const parent = (e.target as HTMLImageElement).parentElement;
            if (parent) parent.dataset.fallback = 'true';
          }}
        />
      ) : null}
      <span className="avatar__initials" aria-hidden="true">{initials}</span>
    </div>
  );
}

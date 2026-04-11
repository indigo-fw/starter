import { cn } from '@/lib/utils';
import './Skeleton.css';

type SkeletonVariant = 'line' | 'circle' | 'card';

interface SkeletonProps {
  /** Shape variant */
  variant?: SkeletonVariant;
  /** Width (CSS value). Default: '100%' for line/card, '40px' for circle. */
  width?: string | number;
  /** Height (CSS value). Default: '1em' for line, equals width for circle, '120px' for card. */
  height?: string | number;
  /** Repeat this skeleton N times (e.g. count={3} for 3 text lines) */
  count?: number;
  /** Additional CSS class */
  className?: string;
}

const DEFAULTS: Record<SkeletonVariant, { width: string; height: string }> = {
  line: { width: '100%', height: '1em' },
  circle: { width: '40px', height: '40px' },
  card: { width: '100%', height: '120px' },
};

/**
 * Skeleton placeholder for loading states.
 *
 * @example
 * <Skeleton variant="line" count={3} />
 * <Skeleton variant="circle" width={48} height={48} />
 * <Skeleton variant="card" height={200} />
 */
export function Skeleton({
  variant = 'line',
  width,
  height,
  count = 1,
  className,
}: SkeletonProps) {
  const defaults = DEFAULTS[variant];
  const w = typeof width === 'number' ? `${width}px` : (width ?? defaults.width);
  const h = typeof height === 'number' ? `${height}px` : (height ?? defaults.height);

  const style = { width: w, height: h };
  const cls = cn(
    'skeleton',
    variant === 'circle' && 'skeleton--circle',
    className,
  );

  if (count === 1) {
    return <div className={cls} style={style} aria-hidden="true" />;
  }

  return (
    <div className="skeleton-group" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cls} style={style} />
      ))}
    </div>
  );
}

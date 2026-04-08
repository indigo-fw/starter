'use client';

import { cn } from '@/lib/utils';

interface CtaSectionProps {
  title: string;
  subtitle?: string;
  primaryAction: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
  variant?: 'default' | 'brand';
  className?: string;
}

export function CtaSection({ title, subtitle, primaryAction, secondaryAction, variant = 'default', className }: CtaSectionProps) {
  return (
    <section className={cn(
      'py-20',
      variant === 'brand' && 'bg-gradient-to-r from-brand-500 to-accent-500',
      className,
    )}>
      <div className="content-container text-center">
        <h2 className={cn(
          'text-3xl font-bold',
          variant === 'brand' ? 'text-white' : 'text-(--text-primary)',
        )}>
          {title}
        </h2>

        {subtitle && (
          <p className={cn(
            'mt-3 text-base max-w-xl mx-auto',
            variant === 'brand' ? 'text-white/80' : 'text-(--text-secondary)',
          )}>
            {subtitle}
          </p>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <a href={primaryAction.href} className={cn(
            'rounded-xl px-8 py-3.5 text-sm font-semibold transition-colors',
            variant === 'brand'
              ? 'bg-white text-brand-600 hover:bg-white/90 shadow-lg'
              : 'btn btn-primary shadow-lg shadow-brand-500/20',
          )}>
            {primaryAction.label}
          </a>
          {secondaryAction && (
            <a href={secondaryAction.href} className={cn(
              'rounded-xl px-8 py-3.5 text-sm font-semibold transition-colors',
              variant === 'brand'
                ? 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
                : 'btn btn-secondary',
            )}>
              {secondaryAction.label}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

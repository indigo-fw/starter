'use client';

import { cn } from '@/lib/utils';

interface HeroSectionProps {
  title: string;
  subtitle?: string;
  /** Primary CTA */
  primaryAction?: { label: string; href: string };
  /** Secondary CTA */
  secondaryAction?: { label: string; href: string };
  /** Background variant */
  variant?: 'default' | 'gradient' | 'dark';
  /** Optional badge above title */
  badge?: string;
  className?: string;
  children?: React.ReactNode;
}

export function HeroSection({
  title, subtitle, primaryAction, secondaryAction,
  variant = 'default', badge, className, children,
}: HeroSectionProps) {
  return (
    <section className={cn(
      'relative overflow-hidden py-20 sm:py-28',
      variant === 'gradient' && 'bg-gradient-to-br from-brand-500/5 via-(--surface-primary) to-accent-500/5',
      variant === 'dark' && 'bg-(--surface-primary)',
      variant === 'default' && 'bg-(--surface-primary)',
      className,
    )}>
      <div className="container mx-auto px-4 text-center relative z-10">
        {badge && (
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-brand-500/10 text-brand-500 mb-6">
            {badge}
          </div>
        )}

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-(--text-primary) max-w-4xl mx-auto leading-tight">
          {title}
        </h1>

        {subtitle && (
          <p className="mt-6 text-lg sm:text-xl text-(--text-secondary) max-w-2xl mx-auto leading-relaxed">
            {subtitle}
          </p>
        )}

        {(primaryAction || secondaryAction) && (
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            {primaryAction && (
              <a href={primaryAction.href}
                className="btn btn-primary rounded-xl px-8 py-3.5 text-sm font-semibold shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30 transition-shadow">
                {primaryAction.label}
              </a>
            )}
            {secondaryAction && (
              <a href={secondaryAction.href}
                className="btn btn-secondary rounded-xl px-8 py-3.5 text-sm font-semibold">
                {secondaryAction.label}
              </a>
            )}
          </div>
        )}

        {children}
      </div>
    </section>
  );
}

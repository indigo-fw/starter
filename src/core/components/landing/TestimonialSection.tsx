'use client';

import { cn } from '@/lib/utils';

export interface Testimonial {
  quote: string;
  name: string;
  role?: string;
  avatarUrl?: string;
}

interface TestimonialSectionProps {
  title?: string;
  subtitle?: string;
  testimonials: Testimonial[];
  className?: string;
}

export function TestimonialSection({ title, subtitle, testimonials, className }: TestimonialSectionProps) {
  return (
    <section className={cn('py-20', className)}>
      <div className="container mx-auto px-4">
        {(title || subtitle) && (
          <div className="text-center mb-14">
            {title && <h2 className="text-3xl font-bold text-(--text-primary)">{title}</h2>}
            {subtitle && <p className="mt-3 text-base text-(--text-secondary) max-w-2xl mx-auto">{subtitle}</p>}
          </div>
        )}

        <div className={cn(
          'grid gap-6 max-w-5xl mx-auto',
          testimonials.length === 1 && 'max-w-2xl',
          testimonials.length === 2 && 'sm:grid-cols-2',
          testimonials.length >= 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        )}>
          {testimonials.map((t, i) => (
            <div key={i} className="p-6 rounded-2xl border border-(--border-primary) bg-(--surface-primary)">
              <p className="text-sm text-(--text-secondary) leading-relaxed italic">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3 mt-5">
                {t.avatarUrl ? (
                  <img src={t.avatarUrl} alt={t.name} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center text-sm font-bold">
                    {t.name[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium text-(--text-primary)">{t.name}</div>
                  {t.role && <div className="text-xs text-(--text-tertiary)">{t.role}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

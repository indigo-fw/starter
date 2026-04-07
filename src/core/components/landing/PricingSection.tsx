'use client';

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export interface PricingPlan {
  name: string;
  description?: string;
  price: string;
  interval?: string;
  features: string[];
  cta: { label: string; href: string };
  highlighted?: boolean;
  badge?: string;
}

interface PricingSectionProps {
  title?: string;
  subtitle?: string;
  plans: PricingPlan[];
  className?: string;
}

export function PricingSection({ title, subtitle, plans, className }: PricingSectionProps) {
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
          'grid gap-8 max-w-5xl mx-auto',
          plans.length === 2 && 'sm:grid-cols-2',
          plans.length >= 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        )}>
          {plans.map((plan, i) => (
            <div key={i} className={cn(
              'relative p-8 rounded-2xl border',
              plan.highlighted
                ? 'border-brand-500 bg-brand-500/5 shadow-xl shadow-brand-500/10'
                : 'border-(--border-primary) bg-(--surface-primary)',
            )}>
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold bg-brand-500 text-white">
                  {plan.badge}
                </div>
              )}

              <h3 className="text-lg font-semibold text-(--text-primary)">{plan.name}</h3>
              {plan.description && <p className="mt-1 text-sm text-(--text-secondary)">{plan.description}</p>}

              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-(--text-primary)">{plan.price}</span>
                {plan.interval && <span className="text-sm text-(--text-tertiary)">/{plan.interval}</span>}
              </div>

              <ul className="mt-8 space-y-3">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex items-start gap-2.5 text-sm text-(--text-secondary)">
                    <Check size={16} className="shrink-0 mt-0.5 text-brand-500" />
                    {feature}
                  </li>
                ))}
              </ul>

              <a href={plan.cta.href} className={cn(
                'mt-8 block text-center rounded-xl px-6 py-3 text-sm font-semibold transition-colors',
                plan.highlighted
                  ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/20'
                  : 'bg-(--surface-secondary) text-(--text-primary) hover:bg-(--surface-tertiary)',
              )}>
                {plan.cta.label}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

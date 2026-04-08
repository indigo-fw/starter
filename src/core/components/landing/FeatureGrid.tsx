'use client';

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

interface FeatureGridProps {
  title?: string;
  subtitle?: string;
  features: Feature[];
  columns?: 2 | 3 | 4;
  className?: string;
}

export function FeatureGrid({ title, subtitle, features, columns = 3, className }: FeatureGridProps) {
  return (
    <section className={cn('py-20', className)}>
      <div className="app-container">
        {(title || subtitle) && (
          <div className="text-center mb-14">
            {title && <h2 className="text-3xl font-bold text-(--text-primary)">{title}</h2>}
            {subtitle && <p className="mt-3 text-base text-(--text-secondary) max-w-2xl mx-auto">{subtitle}</p>}
          </div>
        )}

        <div className={cn(
          'grid gap-8',
          columns === 2 && 'sm:grid-cols-2',
          columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
          columns === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
        )}>
          {features.map((feature, i) => (
            <div key={i} className="group relative p-6 rounded-2xl border border-(--border-primary) bg-(--surface-primary) hover:border-brand-500/30 hover:shadow-lg hover:shadow-brand-500/5 transition-all">
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-500 flex items-center justify-center mb-4 group-hover:bg-brand-500 group-hover:text-white transition-colors">
                <feature.icon size={20} />
              </div>
              <h3 className="font-semibold text-(--text-primary)">{feature.title}</h3>
              <p className="mt-2 text-sm text-(--text-secondary) leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

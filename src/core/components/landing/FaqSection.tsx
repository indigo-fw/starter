'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

export interface FaqItem {
  question: string;
  answer: string;
}

interface FaqSectionProps {
  title?: string;
  subtitle?: string;
  items: FaqItem[];
  className?: string;
}

export function FaqSection({ title, subtitle, items, className }: FaqSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className={cn('py-20', className)}>
      <div className="app-container max-w-3xl">
        {(title || subtitle) && (
          <div className="text-center mb-14">
            {title && <h2 className="text-3xl font-bold text-(--text-primary)">{title}</h2>}
            {subtitle && <p className="mt-3 text-base text-(--text-secondary)">{subtitle}</p>}
          </div>
        )}

        <div className="space-y-3">
          {items.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={i} className="border border-(--border-primary) rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex items-center justify-between w-full px-6 py-4 text-left hover:bg-(--surface-secondary) transition-colors"
                >
                  <span className="font-medium text-(--text-primary) pr-4">{item.question}</span>
                  <ChevronDown size={18} className={cn(
                    'shrink-0 text-(--text-tertiary) transition-transform',
                    isOpen && 'rotate-180',
                  )} />
                </button>
                {isOpen && (
                  <div className="px-6 pb-4 text-sm text-(--text-secondary) leading-relaxed">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

'use client';

import './pricing.css';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
  features: string[];
  cta: string;
  popular?: boolean;
}

interface PricingToggleProps {
  plans: PricingPlan[];
  cryptoEnabled?: boolean;
  registerHref: string;
}

export function PricingToggle({ plans, cryptoEnabled = false, registerHref }: PricingToggleProps) {
  const [yearly, setYearly] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-center gap-3 mb-10">
        <span className={cn('text-sm font-medium', !yearly && 'text-(--text-primary)')}>
          Monthly
        </span>
        <button
          onClick={() => setYearly(!yearly)}
          className={cn(
            'pricing-toggle relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
            yearly ? 'bg-brand-500' : 'bg-gray-300'
          )}
          role="switch"
          aria-checked={yearly}
        >
          <span
            className={cn(
              'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
              yearly ? 'translate-x-6' : 'translate-x-1'
            )}
          />
        </button>
        <span className={cn('text-sm font-medium', yearly && 'text-(--text-primary)')}>
          Yearly <span className="text-xs text-brand-500">Save ~17%</span>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              'pricing-card rounded-xl border p-6 flex flex-col',
              plan.popular
                ? 'pricing-card-highlighted border-brand-500 shadow-lg relative'
                : 'border-(--border-primary)'
            )}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                Most Popular
              </span>
            )}
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <p className="text-sm text-(--text-secondary) mt-1">{plan.description}</p>
            <div className="mt-4 mb-6">
              <span className="text-4xl font-bold">
                {yearly ? plan.priceYearly : plan.priceMonthly}
              </span>
              {plan.priceMonthly !== '$0' && (
                <span className="text-sm text-(--text-secondary)">
                  /{yearly ? 'year' : 'month'}
                </span>
              )}
            </div>
            <ul className="space-y-2 mb-8 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <svg
                    className="w-4 h-4 text-brand-500 shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            <a
              href={plan.id === 'free' ? registerHref : `${registerHref}?plan=${plan.id}`}
              className={cn(
                'block text-center py-2.5 px-4 rounded-lg font-medium text-sm transition-colors',
                plan.popular
                  ? 'bg-brand-500 text-white hover:bg-brand-600'
                  : 'border border-(--border-primary) hover:bg-(--surface-secondary)'
              )}
            >
              {plan.cta}
            </a>
            {cryptoEnabled && yearly && plan.priceYearly !== '$0' && (
              <p className="mt-2 text-center text-xs text-(--text-muted)">
                <span className="inline-flex items-center gap-1 rounded-full bg-(--surface-secondary) px-2 py-0.5">
                  &#x20BF; Pay with Crypto
                </span>
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

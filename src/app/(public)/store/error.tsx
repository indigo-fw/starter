'use client';

import { useBlankTranslations } from '@/lib/translations';

export default function StoreError({ reset }: { error: Error; reset: () => void }) {
  const __ = useBlankTranslations();
  return (
    <div className="app-container py-12 text-center">
      <h2 className="text-xl font-bold text-(--text-primary) mb-2">{__('Something went wrong')}</h2>
      <p className="text-(--text-muted) mb-4">{__('We could not load the store. Please try again.')}</p>
      <button onClick={reset} className="btn-checkout" style={{ maxWidth: '200px', margin: '0 auto' }}>
        {__('Try again')}
      </button>
    </div>
  );
}

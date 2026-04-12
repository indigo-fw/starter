'use client';

import { useBlankTranslations } from '@/lib/translations';
import { ApiKeyManager } from '@/core-api/components/ApiKeyManager';

export default function AccountApiPage() {
  const __ = useBlankTranslations();

  return (
    <div className="app-container py-12">
      <h1 className="text-2xl font-bold mb-2">{__('API Access')}</h1>
      <p className="text-muted mb-8">{__('Create API keys to access your data programmatically.')}</p>
      <ApiKeyManager __={__} />
    </div>
  );
}

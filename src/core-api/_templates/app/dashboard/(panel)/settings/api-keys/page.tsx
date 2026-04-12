'use client';

import { useAdminTranslations } from '@/lib/translations';
import { ApiKeyManager } from '@/core-api/components/ApiKeyManager';

export default function ApiKeysPage() {
  const __ = useAdminTranslations();

  return (
    <div className="dash-container">
      <div className="dash-header">
        <h1>{__('API Keys')}</h1>
        <p className="text-muted">{__('Manage API keys for programmatic access to your data.')}</p>
      </div>
      <div className="dash-main">
        <div className="dash-inner">
          <ApiKeyManager __={__} />
        </div>
      </div>
    </div>
  );
}

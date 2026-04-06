'use client';

import { useState } from 'react';

import { extractInternalLinks } from '@/core/lib/extract-internal-links';
import { trpc } from '@/lib/trpc/client';

/**
 * Post-save broken link validation for CMS forms.
 * Call `validateLinks(content)` after a successful edit save.
 */
export function useLinkValidation() {
  const [brokenLinks, setBrokenLinks] = useState<string[]>([]);
  const trpcUtils = trpc.useUtils();

  const validateLinks = async (content: string) => {
    const links = extractInternalLinks(content);
    if (links.length > 0) {
      try {
        const results = await trpcUtils.cms.validateLinks.fetch({
          urls: links,
        });
        const broken = results.filter((r) => !r.valid).map((r) => r.url);
        setBrokenLinks(broken);
      } catch {
        // Validation failure is non-critical
      }
    } else {
      setBrokenLinks([]);
    }
  };

  return {
    brokenLinks,
    validateLinks,
    dismissBrokenLinks: () => setBrokenLinks([]),
  };
}

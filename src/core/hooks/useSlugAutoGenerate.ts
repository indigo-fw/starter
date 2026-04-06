import { useEffect } from 'react';
import { slugify } from '@/core/lib/slug';

/**
 * Auto-generates a slug from a source value (typically title/name) when creating new content.
 * Only generates when: item is new AND user hasn't manually edited the slug.
 * Replaces the identical useEffect in PostForm, CategoryForm, PortfolioForm, TermForm.
 */
export function useSlugAutoGenerate(
  sourceValue: string,
  isNew: boolean,
  slugManual: boolean,
  setSlug: (slug: string) => void,
) {
  useEffect(() => {
    if (!slugManual && isNew) {
      setSlug(slugify(sourceValue));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceValue, slugManual, isNew]);
}

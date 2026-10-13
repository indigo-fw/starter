import { redirect } from '@/i18n/navigation';
import { getCachedNavigation } from './data';
import { getLocale } from '@/core/lib/i18n/locale-server';
import { getServerTranslations } from '@/lib/translations-server';
import '@/core/styles/mdx-components.css';
import '@/core-docs/styles/docs.css';

/**
 * /docs index — redirects to the first available doc.
 */
export default async function DocsIndexPage() {
  const locale = await getLocale();
  const navigation = await getCachedNavigation(locale);

  if (navigation.length > 0) {
    // Doc slugs are hierarchical ("guides/foo") — split into catch-all segments
    redirect({
      href: { pathname: '/docs/[...slug]', params: { slug: navigation[0].slug.split('/') } },
      locale,
    });
  }

  const __ = await getServerTranslations();

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">{__('Documentation')}</h1>
        <p className="text-(--text-muted)">{__('No documentation pages found yet.')}</p>
      </div>
    </div>
  );
}

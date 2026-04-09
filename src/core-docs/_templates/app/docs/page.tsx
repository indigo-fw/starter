import { redirect } from 'next/navigation';
import { getCachedNavigation } from './data';
import '@/core/styles/mdx-components.css';
import '@/core-docs/styles/docs.css';

/**
 * /docs index — redirects to the first available doc.
 */
export default async function DocsIndexPage() {
  const navigation = await getCachedNavigation();

  if (navigation.length > 0) {
    redirect(`/docs/${navigation[0].slug}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Documentation</h1>
        <p className="text-(--text-muted)">No documentation pages found yet.</p>
      </div>
    </div>
  );
}

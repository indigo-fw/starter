import 'server-only';
import { getLocale } from 'next-intl/server';

/**
 * Loads admin-only translation messages for the current locale.
 * These are kept separate from public messages to:
 * 1. Avoid bloating the public translation bundle
 * 2. Prevent exposing admin UI strings to public pages
 *
 * Used in the dashboard layout to merge admin messages into the provider.
 */
export async function getAdminMessages(): Promise<Record<string, unknown>> {
  const locale = await getLocale();
  try {
    return (await import(`../../../locales/build/${locale}.admin.json`)).default;
  } catch {
    return {};
  }
}

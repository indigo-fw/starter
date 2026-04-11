/**
 * Side-effect: configures the core canonical URL builder.
 * Import once in any server entry point that needs canonical URLs.
 */
import { setCanonicalConfig } from '@/core/lib/seo/canonical';
import { siteConfig } from '@/config/site';
import { DEFAULT_LOCALE } from '@/lib/constants';
import { localePath } from '@/lib/locale';

setCanonicalConfig({
  siteUrl: siteConfig.url,
  defaultLocale: DEFAULT_LOCALE,
  localePath: localePath as (path: string, locale: string) => string,
});

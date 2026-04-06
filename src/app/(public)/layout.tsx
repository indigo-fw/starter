import '@/core/styles/tokens-public.css';
import '@/core/styles/frontend/index.css';

import { Suspense } from 'react';
import NextLink from 'next/link';
import { Link } from '@/i18n/navigation';
import { Rss, Search } from 'lucide-react';

import { siteConfig } from '@/config/site';
import { db } from '@/server/db';
import { cmsCategories, cmsMenus, cmsMenuItems } from '@/server/db/schema';
import { ContentStatus } from '@/core/types/cms';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DynamicNav } from '@/core/components/DynamicNav';
import { ThemeToggle } from '@/core/components/ThemeToggle';
import { MobileMenu } from '@/core/components/MobileMenu';
import { LanguageSwitcher } from '@/core/components/LanguageSwitcher';
import { UserMenu } from '@/components/public/UserMenu';
import { getLocale } from '@/lib/locale-server';
import { localePath } from '@/lib/locale';
import { LOCALES, DEFAULT_LOCALE, LOCALE_LABELS, type Locale } from '@/lib/constants';
import { adminRoutes, contentRoutes, apiRoutes } from '@/config/routes';
import { AuthDialogs } from '@/components/public/AuthDialogs';
import { PUBLIC_LAYOUT_WIDGETS } from '@/generated/module-widgets';
import { getServerTranslations, type TranslationFn } from '@/lib/translations-server';
import { LanguageSuggestionBanner } from '@/core/components/LanguageSuggestionBanner';
import { getLanguageSuggestion } from '@/core/lib/language-suggestion';
import { dataTranslations } from '@/lib/translations';

// Extraction marker — ensures the language suggestion key appears in public PO files
const _d = dataTranslations('General');
_d('This page is available in {language}');

async function getPublishedCategories(locale: Locale) {
  try {
    return await db
      .select({ name: cmsCategories.name, slug: cmsCategories.slug })
      .from(cmsCategories)
      .where(
        and(
          eq(cmsCategories.status, ContentStatus.PUBLISHED),
          eq(cmsCategories.lang, locale),
          isNull(cmsCategories.deletedAt)
        )
      )
      .orderBy(cmsCategories.order)
      .limit(8);
  } catch {
    return [];
  }
}

/** Build serialized nav items for mobile menu — tries DB menu first, falls back to categories */
async function getMobileNavItems(
  categories: { name: string; slug: string }[],
  locale: Locale,
  __: TranslationFn
) {
  try {
    const [menu] = await db
      .select()
      .from(cmsMenus)
      .where(eq(cmsMenus.slug, 'main'))
      .limit(1);

    if (menu) {
      const items = await db
        .select({ label: cmsMenuItems.label, url: cmsMenuItems.url })
        .from(cmsMenuItems)
        .where(eq(cmsMenuItems.menuId, menu.id))
        .orderBy(asc(cmsMenuItems.order))
        .limit(20);

      if (items.length > 0) {
        return items.map((i) => ({
          label: i.label,
          url: localePath(i.url ?? '/', locale),
        }));
      }
    }
  } catch {
    // fall through
  }

  // Fallback: Blog + categories
  return [
    { label: __('Blog'), url: localePath(contentRoutes.blog, locale) },
    ...categories.map((c) => ({
      label: c.name,
      url: localePath(`/category/${c.slug}`, locale),
    })),
    { label: __('Portfolio'), url: localePath(contentRoutes.portfolio, locale) },
    { label: __('Showcase'), url: localePath(contentRoutes.showcase, locale) },
    { label: __('Search'), url: localePath(contentRoutes.search, locale) },
  ];
}

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const [__, categories, langSuggestion] = await Promise.all([
    getServerTranslations(),
    getPublishedCategories(locale),
    getLanguageSuggestion(locale, LOCALES, LOCALE_LABELS),
  ]);
  const mobileItems = await getMobileNavItems(categories, locale, __);

  return (
    <>
      <Suspense fallback={null}>
        {PUBLIC_LAYOUT_WIDGETS.map((Widget, i) => <Widget key={i} />)}
      </Suspense>
      <link
        rel="alternate"
        type="application/rss+xml"
        title={`${siteConfig.name} — ${__('Blog RSS')}`}
        href={`${apiRoutes.feedBlog}?lang=${locale}`}
      />

      {/* ═══ Header ═══ */}
      <header className="header">
        <div className="header-inner">
          <Link href="/" className="header-logo">
            {siteConfig.name}
          </Link>

          {/* Desktop nav */}
          <div className="header-nav hidden sm:flex">
            <DynamicNav
              menuSlug="main"
              fallback={
                <>
                  <Link href="/blog" className="header-link">
                    {__('Blog')}
                  </Link>
                  {categories.map((cat) => (
                    <Link
                      key={cat.slug}
                      href={{ pathname: '/category/[slug]', params: { slug: cat.slug } }}
                      className="header-link"
                    >
                      {cat.name}
                    </Link>
                  ))}
                  <Link href="/showcase" className="header-link">
                    {__('Showcase')}
                  </Link>
                </>
              }
            />
          </div>

          {/* Actions */}
          <div className="header-actions">
            <Link href="/search" className="header-icon-btn" title={__('Search')}>
              <Search className="h-4 w-4" />
            </Link>
            <LanguageSwitcher />
            <ThemeToggle />
            <UserMenu />
            <MobileMenu items={mobileItems} />
          </div>
        </div>
      </header>

      {langSuggestion && (
        <LanguageSuggestionBanner
          suggestedLocale={langSuggestion.suggestedLocale}
          messageInCurrentLang={langSuggestion.messageInCurrentLang}
          messageInSuggestedLang={langSuggestion.messageInSuggestedLang}
          defaultLocale={DEFAULT_LOCALE}
        />
      )}
      <AuthDialogs />
      <main className="flex-1">{children}</main>

      {/* ═══ Footer ═══ */}
      <footer className="footer">
        <div className="container py-8">
          <div className="footer-grid">
            {/* Col 1: About */}
            <div>
              <p className="text-sm font-semibold text-(--text-primary)">
                {siteConfig.name}
              </p>
              <p className="mt-2 text-sm text-(--text-muted)">
                {siteConfig.description}
              </p>
            </div>

            {/* Col 2: Categories */}
            {categories.length > 0 && (
              <div>
                <h4 className="footer-col-title">{__('Categories')}</h4>
                {categories.map((cat) => (
                  <Link
                    key={cat.slug}
                    href={{ pathname: '/category/[slug]', params: { slug: cat.slug } }}
                    className="footer-link"
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            )}

            {/* Col 3: Quick Links */}
            <div>
              <h4 className="footer-col-title">{__('Quick Links')}</h4>
              <Link href="/blog" className="footer-link">{__('Blog')}</Link>
              <Link href="/portfolio" className="footer-link">{__('Portfolio')}</Link>
              <Link href="/showcase" className="footer-link">{__('Showcase')}</Link>
              <Link href="/search" className="footer-link">{__('Search')}</Link>
            </div>

            {/* Col 4: More */}
            <div>
              <h4 className="footer-col-title">{__('More')}</h4>
              <NextLink href={apiRoutes.feedBlog} className="footer-link inline-flex items-center gap-1">
                <Rss className="h-3.5 w-3.5" />
                {__('RSS Feed')}
              </NextLink>
              <NextLink href={adminRoutes.home} className="footer-link">{__('Admin')}</NextLink>
            </div>
          </div>

          <div className="footer-bottom">
            <span>&copy; {new Date().getFullYear()} {siteConfig.name}</span>
            <span>{__('Powered by Indigo')}</span>
          </div>
        </div>
      </footer>
    </>
  );
}

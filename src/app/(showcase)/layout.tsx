import '@/core/styles/tokens-public.css';
import '@/core/styles/frontend/index.css';
import './showcase.css';

import { Link, getPathname } from '@/i18n/navigation';
import { Compass, BookOpen, Briefcase, Home } from 'lucide-react';

import { siteConfig } from '@/config/site';
import { ThemeToggle } from '@/core/components/ThemeToggle';
import { LanguageSwitcher } from '@/core/components/LanguageSwitcher';
import { UserMenu } from '@/components/public/UserMenu';
import { SubscribeOrTokens } from '@/components/public/SubscribeOrTokens';
import { ExpandableSearch } from '@/components/public/ExpandableSearch';
import {
  AppSidebarProvider,
  AppSidebarToggle,
  AppSidebarDrawer,
} from '@/components/public/AppSidebar';
import { getLocale } from '@/lib/locale-server';
import { AuthDialogs } from '@/components/public/AuthDialogs';
import { getServerTranslations } from '@/lib/translations-server';

/**
 * App-like layout for the showcase route group.
 *
 * Structure mirrors the dashboard's dash-* pattern:
 *   .app-wrapper > .app-header > .app-toolbar
 *                  > .app-sidebar
 *                  > .app-main
 *
 * To convert to permanent-sidebar dashboard:
 *   1. Set alwaysOpen on AppSidebarToggle and AppSidebarDrawer
 *   2. Add margin-left matching .app-sidebar width to .app-main
 *
 * To reuse for your whole app:
 *   1. Rename (showcase) to (app) and move your routes here
 *   2. Customize sidebarItems and nav links below
 *   3. Add auth guards as needed
 */
export default async function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const __ = await getServerTranslations();

  const sidebarItems = [
    { label: __('Home'), href: getPathname({ locale, href: '/' }), icon: <Home className="h-4 w-4" /> },
    { label: __('Feed'), href: getPathname({ locale, href: '/showcase' }), icon: <Compass className="h-4 w-4" /> },
    { label: __('Blog'), href: getPathname({ locale, href: '/blog' }), icon: <BookOpen className="h-4 w-4" /> },
    { label: __('Portfolio'), href: getPathname({ locale, href: '/portfolio' }), icon: <Briefcase className="h-4 w-4" /> },
  ];

  return (
    <AppSidebarProvider>
      <div className="app-wrapper" data-page="showcase">
        <header className="app-header">
          <div className="app-toolbar">
            <AppSidebarToggle />

            <Link href="/" className="app-logo">
              {siteConfig.name}
            </Link>

            <nav className="app-nav hidden lg:flex">
              <Link href="/showcase" className="app-nav-link">
                {__('Feed')}
              </Link>
              <Link href="/blog" className="app-nav-link">
                {__('Blog')}
              </Link>
              <Link href="/portfolio" className="app-nav-link">
                {__('Portfolio')}
              </Link>
            </nav>

            <div className="app-spacer" />

            <div className="app-actions">
              <SubscribeOrTokens />
              <ExpandableSearch />
              <LanguageSwitcher />
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </header>

        <AuthDialogs />

        <AppSidebarDrawer items={sidebarItems} />

        <main className="app-main">
          {children}
        </main>
      </div>
    </AppSidebarProvider>
  );
}

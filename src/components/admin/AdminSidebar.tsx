'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Briefcase, ChevronsLeft, ChevronsRight, ExternalLink, FolderOpen, Hash, LogOut, Menu, Monitor, Moon, Search, Sun, User, FileText } from 'lucide-react';

import { cn } from '@/lib/utils';
import { IS_ACTIVE, activeAria } from '@/core/lib/active-props';
import { useAdminTranslations, dataTranslations } from '@/lib/translations';
import { signOut, useSession } from '@/lib/auth-client';
import { useSidebarStore } from '@/core/store/sidebar-store';
import { useThemeStore } from '@/core/store/theme-store';
import { usePreferencesStore } from '@/core/store/preferences-store';
import { siteConfig } from '@/config/site';
import { adminRoutes, adminPanel } from '@/config/routes';
import { navigation, isNavGroup, getActiveSectionId, flatNavItems } from '@/config/admin-nav';
import type { NavChild } from '@/config/admin-nav';
import { CommandPalette, useCommandPaletteShortcut } from '@/core/components/CommandPalette';
import { NotificationBell } from '@/core/components/NotificationBell';
import { OrgSwitcher } from '@/core/components/OrgSwitcher';
import { TokenBalance } from '@/core/components/TokenBalance';
import { ORGANIZATIONS_VISIBLE } from '@/lib/constants';

/* ── Helpers ── */

function isChildActive(child: NavChild, siblings: NavChild[], pathname: string): boolean {
  if (pathname === child.href) return true;
  if (pathname.startsWith(child.href + '/')) {
    const hasBetterMatch = siblings.some(
      (s) => s.href !== child.href && pathname.startsWith(s.href)
    );
    return !hasBetterMatch;
  }
  return false;
}

function RoleBadge({ role }: { role: string }) {
  const classMap: Record<string, string> = {
    superadmin: 'role-badge role-superadmin',
    admin: 'role-badge role-admin',
    editor: 'role-badge role-editor',
    user: 'role-badge role-user',
  };
  return <span className={classMap[role] ?? classMap.user}>{role}</span>;
}

const themeOrder = ['light', 'dark', 'system'] as const;
const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;
const _d = dataTranslations('General');
const themeLabels = { light: _d('Light'), dark: _d('Dark'), system: _d('System') };

/* ── Main Component ── */

export function AdminSidebar() {
  const __ = useAdminTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const { isOpen, closeSidebar, toggleSidebar, isL2Collapsed, toggleL2Collapsed } = useSidebarStore();
  const { data: session } = useSession();
  const { theme, setTheme, initTheme } = useThemeStore();

  // Command palette state
  const paletteNavItems = useMemo(() => flatNavItems(), []);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const closePalette = useCallback(() => setCommandPaletteOpen(false), []);
  useCommandPaletteShortcut(openPalette);

  // User popover state
  const [userPopoverOpen, setUserPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const avatarBtnRef = useRef<HTMLButtonElement>(null);

  // Theme init
  useEffect(() => {
    return initTheme();
  }, [initTheme]);

  // Close popover on outside click
  useEffect(() => {
    if (!userPopoverOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        avatarBtnRef.current &&
        !avatarBtnRef.current.contains(e.target as Node)
      ) {
        setUserPopoverOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [userPopoverOpen]);

  // Close popover when mobile overlay state changes (adjust state during render — React docs pattern)
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (userPopoverOpen) setUserPopoverOpen(false);
  }

  // Active section
  const activeSectionId = getActiveSectionId(pathname);
  const activeItem = useMemo(
    () => navigation.find((item) => item.id === activeSectionId),
    [activeSectionId]
  );
  const hasLevel2 = activeItem && isNavGroup(activeItem);

  // Theme cycling — persist to DB for cross-device sync
  const preferencesSet = usePreferencesStore((s) => s.set);
  function cycleTheme() {
    const idx = themeOrder.indexOf(theme);
    const next = themeOrder[(idx + 1) % themeOrder.length];
    setTheme(next);
    preferencesSet('theme.admin', next);
  }

  async function handleSignOut() {
    await signOut();
    router.push(adminRoutes.login);
  }

  const userRole = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;
  const ThemeIcon = themeIcons[theme];
  const logoLetter = siteConfig.name.charAt(0).toUpperCase();

  /* ── Rail content (shared between desktop and mobile) ── */
  function renderRailNav() {
    return navigation.map((item) => {
      const Icon = item.icon;
      const isActive = item.id === activeSectionId;

      if (isNavGroup(item)) {
        const firstChild = item.children[0];
        return (
          <button
            key={item.id}
            type="button"
            title={item.name}
            onClick={() => {
              if (firstChild) router.push(firstChild.href);
              closeSidebar();
            }}
            className={cn('dash-rail-btn', isActive && IS_ACTIVE)}
            {...activeAria(isActive, 'nav')}
          >
            <Icon className="h-5 w-5" />
          </button>
        );
      }

      return (
        <Link
          key={item.id}
          href={item.href}
          title={item.name}
          onClick={closeSidebar}
          className={cn('dash-rail-btn', isActive && IS_ACTIVE)}
          {...activeAria(isActive, 'nav')}
        >
          <Icon className="h-5 w-5" />
        </Link>
      );
    });
  }

  function renderRailBottom() {
    return (
      <>
        <TokenBalance href={adminPanel.settingsBilling} />
        <NotificationBell notificationsHref={adminPanel.notifications} />
        <button
          type="button"
          title={__('Search')}
          onClick={openPalette}
          className="dash-rail-btn"
        >
          <Search className="h-5 w-5" />
        </button>
        <button
          type="button"
          title={`${__('Theme')}: ${__(themeLabels[theme])}`}
          onClick={cycleTheme}
          className="dash-rail-btn"
        >
          <ThemeIcon className="h-5 w-5" />
        </button>
        <div className="relative">
          <button
            ref={avatarBtnRef}
            type="button"
            title={session?.user?.name ?? __('User')}
            onClick={() => setUserPopoverOpen((v) => !v)}
            className="dash-rail-btn"
          >
            <User className="h-5 w-5" />
          </button>
          {userPopoverOpen && (
            <div ref={popoverRef} className="dash-user-popover">
              {session?.user && (
                <div className="px-3 py-2">
                  <div className="text-sm font-medium text-(--text-primary) truncate">
                    {session.user.name ?? session.user.email}
                  </div>
                  <div className="text-xs text-(--text-muted) truncate mt-0.5">
                    {session.user.email}
                  </div>
                  {userRole && (
                    <div className="mt-1.5">
                      <RoleBadge role={userRole} />
                    </div>
                  )}
                </div>
              )}
              <div className="border-t border-(--border-secondary) mt-1 pt-1">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-(--text-secondary) hover:bg-(--surface-inset) hover:text-(--text-primary)"
                >
                  <LogOut className="h-4 w-4" />
                  {__('Sign Out')}
                </button>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  function renderLevel2() {
    if (!activeItem || !isNavGroup(activeItem)) return null;
    const CollapseIcon = isL2Collapsed ? ChevronsRight : ChevronsLeft;
    return (
      <>
        <div className="flex items-center justify-between mb-1">
          <div className={cn('dash-nav-title', isL2Collapsed && 'sr-only')}>
            {activeItem.name}
          </div>
          <button
            type="button"
            onClick={toggleL2Collapsed}
            className="dash-rail-btn !w-7 !h-7"
            title={isL2Collapsed ? __('Expand panel') : __('Collapse panel')}
          >
            <CollapseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <nav className="flex flex-col gap-0.5">
          {activeItem.children.map((child) => {
            const Icon = child.icon;
            const active = isChildActive(child, activeItem.children, pathname);
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={closeSidebar}
                title={isL2Collapsed ? child.name : undefined}
                className={cn('dash-sidebar-link', active && IS_ACTIVE)}
                {...activeAria(active, 'nav')}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!isL2Collapsed && <span>{child.name}</span>}
              </Link>
            );
          })}
        </nav>
      </>
    );
  }

  return (
    <>
      {/* ── Desktop Rail ── */}
      <aside className="dash-rail hidden xl:flex">
        <Link href={adminRoutes.home} className="dash-rail-logo">
          {logoLetter}
        </Link>
        {ORGANIZATIONS_VISIBLE && <OrgSwitcher manageOrgsHref={adminPanel.organizations} />}
        <div className="dash-rail-nav">
          {renderRailNav()}
        </div>
        <div className="dash-rail-bottom">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="dash-rail-btn"
            title={__('View site')}
          >
            <ExternalLink size={16} />
          </a>
          {renderRailBottom()}
        </div>
      </aside>

      {/* ── Desktop Level 2 Panel (always mounted for transition) ── */}
      <aside
        className={cn(
          'dash-nav hidden xl:block transition-[translate,opacity,width] duration-300 ease-in-out',
          hasLevel2
            ? 'translate-x-0 opacity-100'
            : '-translate-x-full opacity-0 pointer-events-none',
          hasLevel2 && isL2Collapsed && 'dash-nav-collapsed'
        )}
      >
        {hasLevel2 && renderLevel2()}
      </aside>

      {/* ── Mobile Top Bar ── */}
      <div className="dash-mobile-topbar xl:hidden">
        <button
          type="button"
          onClick={toggleSidebar}
          className="dash-rail-btn"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openPalette}
            className="dash-rail-btn"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Mobile Overlay ── */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[55] bg-(--surface-overlay) xl:hidden"
            onClick={closeSidebar}
          />
          <div className="fixed inset-y-0 left-0 z-[60] flex xl:hidden">
            {/* Mobile Rail — inline layout instead of reusing .dash-rail (which is position:fixed) */}
            <aside className="dash-mobile-rail">
              <Link href={adminRoutes.home} onClick={closeSidebar} className="dash-rail-logo">
                {logoLetter}
              </Link>
              {ORGANIZATIONS_VISIBLE && <OrgSwitcher manageOrgsHref={adminPanel.organizations} />}
              <div className="dash-rail-nav">
                {renderRailNav()}
              </div>
              <div className="dash-rail-bottom">
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dash-rail-btn"
                  title={__('View site')}
                >
                  <ExternalLink size={16} />
                </a>
                {renderRailBottom()}
              </div>
            </aside>
            {/* Mobile Level 2 */}
            {hasLevel2 && (
              <aside className="w-[220px] bg-(--surface-secondary) border-r border-(--border-primary) overflow-y-auto p-4 pt-4">
                {renderLevel2()}
              </aside>
            )}
          </div>
        </>
      )}

      {/* ── Command Palette ── */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={closePalette}
        navItems={paletteNavItems}
        contentTypeIcons={{
          page: FileText,
          blog: FileText,
          category: FolderOpen,
          tag: Hash,
          portfolio: Briefcase,
        }}
      />
    </>
  );
}

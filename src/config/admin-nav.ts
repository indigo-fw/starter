/**
 * Admin navigation configuration.
 * Single source of truth — imported by AdminSidebar and CommandPalette.
 *
 * Interfaces and pure helpers live in @/core/config/admin-nav.
 * This file provides the project-specific navigation data array
 * and convenience wrappers that bind the array to the engine helpers.
 */
import {
  Activity,
  ArrowRightLeft,
  Briefcase,
  Tv,
  Calendar,
  ClipboardList,
  CreditCard,
  FileText,
  FolderKanban,
  FolderOpen,
  Hash,
  Home,
  Image,
  Layers,
  LifeBuoy,
  Link2,
  ListChecks,
  Mail,
  Menu,
  Settings,
  Tag,
  Upload,
  Users,
  Webhook,
} from 'lucide-react';

// Re-export interfaces and type guard from core (keeps existing imports working)
export { isNavGroup } from '@/core/config/admin-nav';
export type { NavChild, NavLink, NavGroup, NavItem } from '@/core/config/admin-nav';

import {
  flatNavItems as _flatNavItems,
  getActiveSectionId as _getActiveSectionId,
  getNavItem as _getNavItem,
} from '@/core/config/admin-nav';
import type { NavItem } from '@/core/config/admin-nav';
import { adminRoutes, adminPanel } from '@/config/routes';

export const navigation: NavItem[] = [
  { id: 'dashboard', name: 'Dashboard', href: adminRoutes.home, icon: Home },
  {
    id: 'content',
    name: 'Content',
    icon: FileText,
    children: [
      { name: 'Pages', href: adminPanel.cms('pages'), icon: FileText },
      { name: 'Blog', href: adminPanel.cms('blog'), icon: Layers },
      { name: 'Portfolio', href: adminPanel.cms('portfolio'), icon: Briefcase },
      { name: 'Showcase', href: adminPanel.cms('showcase'), icon: Tv },
      { name: 'Calendar', href: adminPanel.calendar, icon: Calendar },
    ],
  },
  { id: 'media', name: 'Media', href: adminPanel.media, icon: Image },
  {
    id: 'structure',
    name: 'Structure',
    icon: FolderOpen,
    children: [
      { name: 'Categories', href: adminPanel.cms('categories'), icon: FolderOpen },
      { name: 'Tags', href: adminPanel.cms('tags'), icon: Hash },
      { name: 'Menus', href: adminPanel.menus, icon: Menu },
      { name: 'Redirects', href: adminPanel.redirects, icon: ArrowRightLeft },
      { name: 'Forms', href: adminPanel.forms, icon: ClipboardList },
    ],
  },
  { id: 'users', name: 'Users', href: adminPanel.users, icon: Users },
  {
    id: 'billing',
    name: 'Billing',
    icon: CreditCard,
    children: [
      { name: 'Overview', href: adminPanel.settingsBilling, icon: CreditCard },
      { name: 'Discount Codes', href: adminPanel.settingsDiscountCodes, icon: Tag },
      { name: 'Affiliates', href: adminPanel.settingsAffiliates, icon: Link2 },
    ],
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: Settings,
    children: [
      { name: 'General', href: adminPanel.settings, icon: Settings },
      { name: 'Custom Fields', href: adminPanel.settingsCustomFields, icon: Layers },
      { name: 'Email Templates', href: adminPanel.settingsEmailTemplates, icon: Mail },
      { name: 'Webhooks', href: adminPanel.settingsWebhooks, icon: Webhook },
      { name: 'Import', href: adminPanel.settingsImport, icon: Upload },
      { name: 'Job Queue', href: adminPanel.settingsJobQueue, icon: ListChecks },
      { name: 'Activity', href: adminPanel.activity, icon: Activity },
      { name: 'Support', href: adminPanel.settingsSupport, icon: LifeBuoy },
    ],
  },
  { id: 'projects', name: 'Projects', href: adminPanel.projects, icon: FolderKanban },
];

/** Flatten navigation into a flat list for search/command palette */
export function flatNavItems() {
  return _flatNavItems(navigation);
}

/**
 * Determine the active section ID from the current pathname.
 * Checks top-level links first, then groups (match child hrefs).
 */
export function getActiveSectionId(pathname: string): string | null {
  return _getActiveSectionId(navigation, pathname);
}

/** Get a nav item by its ID */
export function getNavItem(id: string): NavItem | undefined {
  return _getNavItem(navigation, id);
}

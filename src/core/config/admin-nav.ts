/**
 * Admin navigation interfaces and helpers.
 * Engine-side — no project-specific data. Functions accept
 * a navigation array parameter so they stay pure.
 */

export interface NavChild {
  name: string;
  href: string;
  icon: React.ElementType;
}

export interface NavLink {
  id: string;
  name: string;
  href: string;
  icon: React.ElementType;
}

export interface NavGroup {
  id: string;
  name: string;
  icon: React.ElementType;
  children: NavChild[];
}

export type NavItem = NavLink | NavGroup;

export function isNavGroup(item: NavItem): item is NavGroup {
  return 'children' in item;
}

/** Flatten navigation into a flat list for search/command palette */
export function flatNavItems(
  nav: NavItem[],
): { name: string; href: string; icon: React.ElementType; group?: string }[] {
  const items: { name: string; href: string; icon: React.ElementType; group?: string }[] = [];
  for (const item of nav) {
    if (isNavGroup(item)) {
      for (const child of item.children) {
        items.push({ ...child, group: item.name });
      }
    } else {
      items.push(item);
    }
  }
  return items;
}

/**
 * Determine the active section ID from the current pathname.
 * Checks top-level links first, then groups (match child hrefs).
 * This ensures /dashboard/cms/activity matches the 'activity' NavLink,
 * not the 'content' NavGroup (since Activity is a top-level link).
 */
export function getActiveSectionId(nav: NavItem[], pathname: string): string | null {
  // First pass: check top-level links (exact or prefix match)
  // This catches single-page sections like Activity before groups can claim them
  for (const item of nav) {
    if (!isNavGroup(item)) {
      if (item.href === '/dashboard') {
        if (pathname === '/dashboard') return item.id;
      } else if (pathname === item.href || pathname.startsWith(item.href + '/')) {
        return item.id;
      }
    }
  }

  // Second pass: check groups (match child hrefs)
  for (const item of nav) {
    if (isNavGroup(item)) {
      for (const child of item.children) {
        if (pathname === child.href || pathname.startsWith(child.href + '/')) {
          return item.id;
        }
      }
    }
  }

  return null;
}

/** Get a nav item by its ID */
export function getNavItem(nav: NavItem[], id: string): NavItem | undefined {
  return nav.find((item) => item.id === id);
}

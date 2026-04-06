import { db } from '@/server/db';
import { cmsMenus, cmsMenuItems } from '@/server/db/schema';
import { asc, eq } from 'drizzle-orm';

interface Props {
  menuSlug: string;
  fallback?: React.ReactNode;
}

interface NavItem {
  id: string;
  parentId: string | null;
  label: string;
  url: string | null;
  openInNewTab: boolean;
  order: number;
  children: NavItem[];
}

function buildTree(items: NavItem[]): NavItem[] {
  const map = new Map<string, NavItem>();
  const roots: NavItem[] = [];

  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }

  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <li className="dynamic-nav-item">
      <a
        href={item.url ?? '#'}
        target={item.openInNewTab ? '_blank' : undefined}
        rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
        className="text-sm text-(--text-secondary) hover:text-(--text-primary) transition-colors"
      >
        {item.label}
      </a>
      {item.children.length > 0 && (
        <ul className="ml-4 mt-1 space-y-1">
          {item.children.map((child) => (
            <NavItemLink key={child.id} item={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

export async function DynamicNav({ menuSlug, fallback }: Props) {
  const [menu] = await db
    .select()
    .from(cmsMenus)
    .where(eq(cmsMenus.slug, menuSlug))
    .limit(1);

  if (!menu) return fallback ?? null;

  const rawItems = await db
    .select()
    .from(cmsMenuItems)
    .where(eq(cmsMenuItems.menuId, menu.id))
    .orderBy(asc(cmsMenuItems.order))
    .limit(200);

  const items: NavItem[] = rawItems.map((item) => ({
    id: item.id,
    parentId: item.parentId,
    label: item.label,
    url: item.url,
    openInNewTab: item.openInNewTab,
    order: item.order,
    children: [],
  }));

  const tree = buildTree(items);

  if (tree.length === 0) return null;

  return (
    <nav className="dynamic-nav">
      <ul className="dynamic-nav-list flex flex-wrap items-center gap-4">
        {tree.map((item) => (
          <NavItemLink key={item.id} item={item} />
        ))}
      </ul>
    </nav>
  );
}

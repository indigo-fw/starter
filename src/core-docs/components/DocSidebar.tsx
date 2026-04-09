'use client';

import { LocaleLink as Link } from '@/core/components/LocaleLink';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { DocNavItem } from '@/core-docs/lib/docs-service';

interface DocSidebarProps {
  navigation: DocNavItem[];
  activeSlug: string;
}

function NavItem({ item, activeSlug, depth = 0 }: { item: DocNavItem; activeSlug: string; depth?: number }) {
  const isActive = item.slug === activeSlug;
  const hasChildren = item.children.length > 0;
  const isChildActive = hasChildren && item.children.some(
    (c) => c.slug === activeSlug || c.children.some((gc) => gc.slug === activeSlug)
  );
  const [isOpen, setIsOpen] = useState(isActive || isChildActive);

  return (
    <li>
      <div className="flex items-center">
        <Link
          href={`/docs/${item.slug}`}
          className={cn(
            'flex-1 block py-1.5 text-sm transition-colors',
            depth > 0 && 'pl-4',
            isActive
              ? 'font-semibold text-(--text-primary)'
              : 'text-(--text-muted) hover:text-(--text-primary)',
          )}
        >
          {item.title}
        </Link>
        {hasChildren && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 text-(--text-muted) hover:text-(--text-primary)"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            <svg className={cn('w-3 h-3 transition-transform', isOpen && 'rotate-90')} viewBox="0 0 12 12" fill="currentColor">
              <path d="M4 2l4 4-4 4" />
            </svg>
          </button>
        )}
      </div>
      {hasChildren && isOpen && (
        <ul className="ml-2 border-l border-(--surface-secondary) pl-2">
          {item.children.map((child) => (
            <NavItem key={child.slug} item={child} activeSlug={activeSlug} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function DocSidebar({ navigation, activeSlug }: DocSidebarProps) {
  // Group by section
  const sections = new Map<string, DocNavItem[]>();
  for (const item of navigation) {
    const section = item.section ?? 'Documentation';
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section)!.push(item);
  }

  return (
    <aside className="docs-sidebar">
      <nav>
        {[...sections.entries()].map(([section, items]) => (
          <div key={section} className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-(--text-muted) mb-2">
              {section}
            </h3>
            <ul className="space-y-0.5">
              {items.map((item) => (
                <NavItem key={item.slug} item={item} activeSlug={activeSlug} />
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

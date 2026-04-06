'use client';

import './account.css';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ElementType } from 'react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: ElementType;
  exact?: boolean;
}

interface AccountSidebarProps {
  navItems: NavItem[];
}

export function AccountSidebar({ navItems }: AccountSidebarProps) {
  const pathname = usePathname();

  return (
    <nav className="account-sidebar w-full md:w-56 shrink-0">
      <ul className="space-y-1">
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  'account-sidebar-link flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  active
                    ? 'bg-brand-500/10 text-brand-500 font-medium'
                    : 'text-(--text-secondary) hover:bg-(--surface-secondary)'
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

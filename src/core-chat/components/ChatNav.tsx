'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  MessageCircle,
  Settings,
  CreditCard,
  User,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatNavItem {
  href: string;
  icon: React.ReactNode;
  label: string;
  exact?: boolean;
}

const NAV_ITEMS: ChatNavItem[] = [
  { href: '/', icon: <Home size={20} />, label: 'Home' },
  { href: '/chat', icon: <MessageCircle size={20} />, label: 'Chat', exact: false },
  { href: '/account', icon: <User size={20} />, label: 'Account' },
  { href: '/account/billing', icon: <CreditCard size={20} />, label: 'Billing' },
];

/**
 * Minimal left navigation rail for the chat layout.
 * Shows icons only on desktop, hidden on mobile (hamburger in ChatLayout).
 */
export function ChatNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden xl:flex flex-col w-16 h-full border-r border-(--border-primary) bg-(--surface-primary) shrink-0">
      {/* Logo / brand area */}
      <div className="flex items-center justify-center h-14 border-b border-(--border-primary)">
        <NextLink href="/" className="text-brand-500 font-bold text-lg">
          I
        </NextLink>
      </div>

      {/* Nav items */}
      <div className="flex-1 flex flex-col items-center gap-1 py-3">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact === false
            ? pathname.startsWith(item.href)
            : pathname === item.href;

          return (
            <NextLink
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-xl transition-colors',
                isActive
                  ? 'bg-brand-500/10 text-brand-500'
                  : 'text-(--text-tertiary) hover:text-(--text-primary) hover:bg-(--surface-secondary)',
              )}
            >
              {item.icon}
            </NextLink>
          );
        })}
      </div>

      {/* Bottom spacer */}
      <div className="flex flex-col items-center gap-1 py-3 border-t border-(--border-primary)">
        <NextLink
          href="/dashboard/settings/chat"
          title="Chat Settings"
          className="flex items-center justify-center w-10 h-10 rounded-xl text-(--text-tertiary) hover:text-(--text-primary) hover:bg-(--surface-secondary) transition-colors"
        >
          <Settings size={20} />
        </NextLink>
      </div>
    </nav>
  );
}

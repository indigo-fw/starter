'use client';

import { User, Settings, Shield, CreditCard, LifeBuoy, Link2 } from 'lucide-react';
import { AccountSidebar } from '@/core/components/AccountSidebar';
import { accountRoutes } from '@/config/routes';

const ACCOUNT_NAV_ITEMS = [
  { href: accountRoutes.home, label: 'Overview', icon: User, exact: true },
  { href: accountRoutes.settings, label: 'Settings', icon: Settings },
  { href: accountRoutes.security, label: 'Security', icon: Shield },
  { href: accountRoutes.billing, label: 'Billing', icon: CreditCard },
  { href: accountRoutes.support, label: 'Support', icon: LifeBuoy },
  { href: accountRoutes.affiliates, label: 'Affiliates', icon: Link2 },
];

export function AccountNav() {
  return <AccountSidebar navItems={ACCOUNT_NAV_ITEMS} />;
}

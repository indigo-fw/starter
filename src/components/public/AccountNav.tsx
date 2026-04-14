'use client';

import { User, Settings, Shield, CreditCard, LifeBuoy, Link2, ShoppingBag, Heart } from 'lucide-react';
import { AccountSidebar } from '@/core/components/AccountSidebar';
import { accountRoutes } from '@/config/routes';
import { useTranslations } from '@/lib/translations';

export function AccountNav() {
  const __ = useTranslations();

  const items = [
    { href: accountRoutes.home, label: __('Overview'), icon: User, exact: true },
    { href: accountRoutes.settings, label: __('Settings'), icon: Settings },
    { href: accountRoutes.security, label: __('Security'), icon: Shield },
    { href: accountRoutes.billing, label: __('Billing'), icon: CreditCard },
    { href: accountRoutes.orders, label: __('Orders'), icon: ShoppingBag },
    { href: accountRoutes.wishlist, label: __('Wishlist'), icon: Heart },
    { href: accountRoutes.support, label: __('Support'), icon: LifeBuoy },
    { href: accountRoutes.affiliates, label: __('Affiliates'), icon: Link2 },
  ];

  return <AccountSidebar navItems={items} />;
}

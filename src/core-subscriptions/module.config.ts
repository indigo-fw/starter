import type { ModuleConfig } from '@/core/lib/module-config';

const config: ModuleConfig = {
  id: 'core-subscriptions',
  routers: [
    { name: 'billingRouter', key: 'billing', from: '@/core-subscriptions/routers/billing' },
    { name: 'discountCodesRouter', key: 'discountCodes', from: '@/core-subscriptions/routers/discount-codes' },
  ],
  schema: [
    '@/core-subscriptions/schema/subscriptions',
  ],
  serverInit: [
    '@/config/subscriptions-deps',
  ],
  jobs: [],
  seed: [
    { name: 'seedBilling', from: '@/core-subscriptions/seed', label: 'Billing demo data (users, orgs, subscriptions, tokens)' },
  ],
  layoutWidgets: [],
  navItems: [
    { groupId: 'billing', name: 'Overview', href: '/dashboard/settings/billing', icon: 'CreditCard' },
    { groupId: 'billing', name: 'Discount Codes', href: '/dashboard/settings/discount-codes', icon: 'Tag' },
  ],
  projectFiles: [
    'config/subscriptions-deps.ts',
    'app/dashboard/(panel)/settings/billing/page.tsx',
    'app/dashboard/(panel)/settings/billing/components/SubscriptionSummary.tsx',
    'app/dashboard/(panel)/settings/billing/components/SubscriptionsTable.tsx',
    'app/dashboard/(panel)/settings/billing/components/ChurnedSubscriptionsTable.tsx',
    'app/dashboard/(panel)/settings/billing/components/DiscountCodesTable.tsx',
    'app/dashboard/(panel)/settings/billing/components/RevenueChart.tsx',
    'app/dashboard/(panel)/settings/billing/components/RecentTransactionsTable.tsx',
    'app/dashboard/(panel)/settings/discount-codes/page.tsx',
    'app/(public)/account/billing/page.tsx',
    'app/(public)/pricing/page.tsx',
  ],
};

export default config;

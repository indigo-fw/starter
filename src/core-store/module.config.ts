import type { ModuleConfig } from '@/core/lib/module-config';

const config: ModuleConfig = {
  id: 'core-store',
  routers: [
    { name: 'storeProductsRouter', key: 'storeProducts', from: '@/core-store/routers/products' },
    { name: 'storeCartRouter', key: 'storeCart', from: '@/core-store/routers/cart' },
    { name: 'storeCheckoutRouter', key: 'storeCheckout', from: '@/core-store/routers/checkout' },
    { name: 'storeOrdersRouter', key: 'storeOrders', from: '@/core-store/routers/orders' },
  ],
  schema: [
    '@/core-store/schema/products',
    '@/core-store/schema/orders',
    '@/core-store/schema/shipping-tax',
  ],
  serverInit: [
    '@/config/store-deps',
  ],
  jobs: [],
  seed: [
    { name: 'seedStore', from: '@/core-store/seed', label: 'Store demo products, shipping zones & tax rates', hasDataCheck: 'hasStoreData' },
  ],
  layoutWidgets: [],
  pageWidgets: [],
  navItems: [],
  projectFiles: [
    'config/store-deps.ts',
  ],
};

export default config;

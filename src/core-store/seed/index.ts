import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { count } from 'drizzle-orm';

import { storeProducts, storeProductVariants, storeVariantGroups, storeProductImages, storeCategories, storeProductCategories } from '../schema/products';
import { storeShippingZones, storeShippingRates, storeTaxRates } from '../schema/shipping-tax';
import { placeholderImage } from '../lib/placeholder-image';

// ─── IDs (deterministic for idempotent seeding) ───────────────────────────

const CAT_APPAREL = '00000000-0000-4000-a000-000000000101';
const CAT_ACCESSORIES = '00000000-0000-4000-a000-000000000102';
const CAT_DIGITAL = '00000000-0000-4000-a000-000000000103';

const PROD_TSHIRT = '00000000-0000-4000-b000-000000000201';
const PROD_HOODIE = '00000000-0000-4000-b000-000000000202';
const PROD_CAP = '00000000-0000-4000-b000-000000000203';
const PROD_MUG = '00000000-0000-4000-b000-000000000204';
const PROD_EBOOK = '00000000-0000-4000-b000-000000000205';
const PROD_TEMPLATE = '00000000-0000-4000-b000-000000000206';
const PROD_ICONS = '00000000-0000-4000-b000-000000000207';
const PROD_STICKER = '00000000-0000-4000-b000-000000000208';

const ZONE_EU = '00000000-0000-4000-c000-000000000301';
const ZONE_US = '00000000-0000-4000-c000-000000000302';
const ZONE_REST = '00000000-0000-4000-c000-000000000303';

/**
 * Check if store data already exists (skip seed if so).
 */
export async function hasStoreData(db: PostgresJsDatabase): Promise<boolean> {
  const [row] = await db.select({ count: count() }).from(storeProducts);
  return (row?.count ?? 0) > 0;
}

/**
 * Seed store with demo products, categories, shipping zones, and tax rates.
 */
export async function seedStore(db: PostgresJsDatabase, _superadminUserId: string): Promise<{ userIds?: string[]; orgIds?: string[] }> {
  // ─── Categories ───────────────────────────────────────────────────────
  await db.insert(storeCategories).values([
    { id: CAT_APPAREL, name: 'Apparel', slug: 'apparel', description: 'Clothing and wearables', sortOrder: 0 },
    { id: CAT_ACCESSORIES, name: 'Accessories', slug: 'accessories', description: 'Bags, mugs, and more', sortOrder: 1 },
    { id: CAT_DIGITAL, name: 'Digital Products', slug: 'digital-products', description: 'Downloads, templates, and digital assets', sortOrder: 2 },
  ]).onConflictDoNothing();

  // ─── Products ─────────────────────────────────────────────────────────

  await db.insert(storeProducts).values([
    // 1. Classic T-Shirt (variable — sizes + colors)
    {
      id: PROD_TSHIRT,
      type: 'variable',
      status: 'published',
      name: 'Classic Logo T-Shirt',
      slug: 'classic-logo-tshirt',
      description: 'Premium organic cotton t-shirt with embroidered logo. Comfortable everyday fit with reinforced seams for durability. Pre-shrunk fabric maintains shape wash after wash.',
      shortDescription: 'Soft organic cotton tee with embroidered logo',
      priceCents: 2990,
      comparePriceCents: 3990,
      currency: 'EUR',
      sku: 'TSH-CLASSIC',
      trackInventory: true,
      stockQuantity: 200,
      weightGrams: 220,
      taxClass: 'standard',
      requiresShipping: true,
      featuredImage: placeholderImage('Classic Logo T-Shirt'),
      metaTitle: 'Classic Logo T-Shirt — Premium Organic Cotton',
      metaDescription: 'Soft organic cotton t-shirt with embroidered logo. Available in multiple sizes and colors.',
      sortOrder: 0,
    },
    // 2. Developer Hoodie (variable — sizes)
    {
      id: PROD_HOODIE,
      type: 'variable',
      status: 'published',
      name: 'Developer Hoodie',
      slug: 'developer-hoodie',
      description: 'Heavyweight brushed fleece hoodie designed for long coding sessions. Features a kangaroo pocket, YKK zipper, and cable routing hole for earbuds. Double-lined hood with drawstrings.',
      shortDescription: 'Heavyweight fleece hoodie for developers',
      priceCents: 5990,
      currency: 'EUR',
      sku: 'HOD-DEV',
      trackInventory: true,
      stockQuantity: 80,
      weightGrams: 650,
      taxClass: 'standard',
      requiresShipping: true,
      featuredImage: placeholderImage('Developer Hoodie'),
      metaTitle: 'Developer Hoodie — Heavyweight Fleece',
      metaDescription: 'Premium hoodie for developers. Heavyweight fleece with cable routing and kangaroo pocket.',
      sortOrder: 1,
    },
    // 3. Snapback Cap (simple)
    {
      id: PROD_CAP,
      type: 'simple',
      status: 'published',
      name: 'Snapback Cap',
      slug: 'snapback-cap',
      description: 'Structured 6-panel snapback cap with flat brim and embroidered logo. Adjustable snap closure fits most head sizes. Moisture-wicking sweatband keeps you cool.',
      shortDescription: 'Structured snapback with embroidered logo',
      priceCents: 1990,
      currency: 'EUR',
      sku: 'CAP-SNAP',
      trackInventory: true,
      stockQuantity: 150,
      weightGrams: 100,
      taxClass: 'standard',
      requiresShipping: true,
      featuredImage: placeholderImage('Snapback Cap'),
      sortOrder: 2,
    },
    // 4. Ceramic Mug (simple)
    {
      id: PROD_MUG,
      type: 'simple',
      status: 'published',
      name: 'Ceramic Coffee Mug',
      slug: 'ceramic-coffee-mug',
      description: 'Large 15oz ceramic mug with a comfortable C-handle. Dishwasher and microwave safe. Features a wrap-around print with a matte finish exterior and glossy interior.',
      shortDescription: 'Large 15oz ceramic mug with wrap-around print',
      priceCents: 1490,
      currency: 'EUR',
      sku: 'MUG-15OZ',
      trackInventory: true,
      stockQuantity: 300,
      weightGrams: 400,
      taxClass: 'standard',
      requiresShipping: true,
      featuredImage: placeholderImage('Ceramic Coffee Mug'),
      sortOrder: 3,
    },
    // 5. E-Book (digital)
    {
      id: PROD_EBOOK,
      type: 'digital',
      status: 'published',
      name: 'Building SaaS with Indigo — E-Book',
      slug: 'building-saas-with-indigo-ebook',
      description: 'Comprehensive 280-page guide to building production SaaS applications with the Indigo framework. Covers architecture decisions, authentication, billing integration, multi-tenancy, deployment strategies, and scaling patterns. Includes code samples and a reference project.',
      shortDescription: 'Complete guide to building SaaS apps with Indigo',
      priceCents: 2990,
      currency: 'EUR',
      sku: 'EBOOK-SAAS',
      trackInventory: false,
      taxClass: 'standard',
      requiresShipping: false,
      digitalFileUrl: '/downloads/building-saas-with-indigo.pdf',
      downloadLimit: 5,
      featuredImage: placeholderImage('SaaS E-Book'),
      metaTitle: 'Building SaaS with Indigo — E-Book (PDF)',
      metaDescription: 'Learn to build production SaaS with Indigo. 280 pages covering auth, billing, multi-tenancy, and more.',
      sortOrder: 4,
    },
    // 6. Website Template Pack (digital)
    {
      id: PROD_TEMPLATE,
      type: 'digital',
      status: 'published',
      name: 'Starter Template Pack',
      slug: 'starter-template-pack',
      description: 'Collection of 12 professionally designed page templates for Indigo projects. Includes landing pages, pricing pages, about pages, contact forms, and blog layouts. All templates use the Indigo design system tokens and are fully responsive.',
      shortDescription: '12 professionally designed page templates',
      priceCents: 4990,
      comparePriceCents: 7990,
      currency: 'EUR',
      sku: 'TPL-STARTER',
      trackInventory: false,
      taxClass: 'standard',
      requiresShipping: false,
      digitalFileUrl: '/downloads/starter-template-pack.zip',
      downloadLimit: 3,
      featuredImage: placeholderImage('Starter Template Pack'),
      sortOrder: 5,
    },
    // 7. Icon Set (digital)
    {
      id: PROD_ICONS,
      type: 'digital',
      status: 'published',
      name: 'Premium Icon Set',
      slug: 'premium-icon-set',
      description: 'Hand-crafted set of 500+ SVG icons optimized for web applications. Includes filled, outlined, and duotone variants. Designed on a 24px grid with consistent stroke widths. Figma file included.',
      shortDescription: '500+ SVG icons in 3 styles with Figma source',
      priceCents: 1990,
      currency: 'EUR',
      sku: 'ICO-PREMIUM',
      trackInventory: false,
      taxClass: 'standard',
      requiresShipping: false,
      digitalFileUrl: '/downloads/premium-icon-set.zip',
      downloadLimit: 5,
      featuredImage: placeholderImage('Premium Icon Set'),
      sortOrder: 6,
    },
    // 8. Sticker Pack (simple, low-price)
    {
      id: PROD_STICKER,
      type: 'simple',
      status: 'published',
      name: 'Developer Sticker Pack',
      slug: 'developer-sticker-pack',
      description: 'Set of 10 die-cut vinyl stickers featuring popular developer memes and logos. Waterproof and UV-resistant. Perfect for laptops, water bottles, and notebooks.',
      shortDescription: '10 die-cut vinyl developer stickers',
      priceCents: 790,
      currency: 'EUR',
      sku: 'STK-DEV-10',
      trackInventory: true,
      stockQuantity: 500,
      weightGrams: 50,
      taxClass: 'standard',
      requiresShipping: true,
      featuredImage: placeholderImage('Developer Sticker Pack'),
      sortOrder: 7,
    },
  ]).onConflictDoNothing();

  // ─── Product ↔ Category mappings ──────────────────────────────────────

  await db.insert(storeProductCategories).values([
    { productId: PROD_TSHIRT, categoryId: CAT_APPAREL },
    { productId: PROD_HOODIE, categoryId: CAT_APPAREL },
    { productId: PROD_CAP, categoryId: CAT_ACCESSORIES },
    { productId: PROD_MUG, categoryId: CAT_ACCESSORIES },
    { productId: PROD_STICKER, categoryId: CAT_ACCESSORIES },
    { productId: PROD_EBOOK, categoryId: CAT_DIGITAL },
    { productId: PROD_TEMPLATE, categoryId: CAT_DIGITAL },
    { productId: PROD_ICONS, categoryId: CAT_DIGITAL },
  ]).onConflictDoNothing();

  // ─── Variant Groups ───────────────────────────────────────────────────

  const VG_TSHIRT_SIZE = '00000000-0000-4000-d000-000000000401';
  const VG_TSHIRT_COLOR = '00000000-0000-4000-d000-000000000402';
  const VG_HOODIE_SIZE = '00000000-0000-4000-d000-000000000403';

  await db.insert(storeVariantGroups).values([
    { id: VG_TSHIRT_SIZE, productId: PROD_TSHIRT, name: 'Size', sortOrder: 0 },
    { id: VG_TSHIRT_COLOR, productId: PROD_TSHIRT, name: 'Color', sortOrder: 1 },
    { id: VG_HOODIE_SIZE, productId: PROD_HOODIE, name: 'Size', sortOrder: 0 },
  ]).onConflictDoNothing();

  // ─── Product Variants ─────────────────────────────────────────────────

  // T-Shirt variants (Size × Color)
  const tshirtVariants = [
    { size: 'S', color: 'White', price: 2990, stock: 25 },
    { size: 'M', color: 'White', price: 2990, stock: 40 },
    { size: 'L', color: 'White', price: 2990, stock: 35 },
    { size: 'XL', color: 'White', price: 2990, stock: 20 },
    { size: 'S', color: 'Black', price: 2990, stock: 30 },
    { size: 'M', color: 'Black', price: 2990, stock: 50, isDefault: true },
    { size: 'L', color: 'Black', price: 2990, stock: 40 },
    { size: 'XL', color: 'Black', price: 2990, stock: 15 },
  ];

  await db.insert(storeProductVariants).values(
    tshirtVariants.map((v, i) => ({
      id: `00000000-0000-4000-e000-0000000005${String(i).padStart(2, '0')}`,
      productId: PROD_TSHIRT,
      name: `${v.size} / ${v.color}`,
      sku: `TSH-CLASSIC-${v.size}-${v.color.toUpperCase().slice(0, 3)}`,
      priceCents: v.price,
      comparePriceCents: 3990,
      stockQuantity: v.stock,
      weightGrams: 220,
      options: { Size: v.size, Color: v.color },
      isDefault: v.isDefault ?? false,
      sortOrder: i,
    }))
  ).onConflictDoNothing();

  // Hoodie variants (Size)
  const hoodieVariants = [
    { size: 'S', price: 5990, stock: 15 },
    { size: 'M', price: 5990, stock: 25, isDefault: true },
    { size: 'L', price: 5990, stock: 20 },
    { size: 'XL', price: 5990, stock: 10 },
    { size: 'XXL', price: 6490, stock: 10 },
  ];

  await db.insert(storeProductVariants).values(
    hoodieVariants.map((v, i) => ({
      id: `00000000-0000-4000-e000-0000000006${String(i).padStart(2, '0')}`,
      productId: PROD_HOODIE,
      name: v.size,
      sku: `HOD-DEV-${v.size}`,
      priceCents: v.price,
      stockQuantity: v.stock,
      weightGrams: 650,
      options: { Size: v.size },
      isDefault: v.isDefault ?? false,
      sortOrder: i,
    }))
  ).onConflictDoNothing();

  // ─── Product Images (gallery) ─────────────────────────────────────────

  await db.insert(storeProductImages).values([
    { productId: PROD_TSHIRT, url: placeholderImage('T-Shirt Front', 800), alt: 'Classic Logo T-Shirt front', sortOrder: 0 },
    { productId: PROD_TSHIRT, url: placeholderImage('T-Shirt Back', 800), alt: 'Classic Logo T-Shirt back', sortOrder: 1 },
    { productId: PROD_HOODIE, url: placeholderImage('Hoodie Front', 800), alt: 'Developer Hoodie front', sortOrder: 0 },
    { productId: PROD_HOODIE, url: placeholderImage('Hoodie Back', 800), alt: 'Developer Hoodie back', sortOrder: 1 },
    { productId: PROD_CAP, url: placeholderImage('Cap Side', 800), alt: 'Snapback Cap', sortOrder: 0 },
    { productId: PROD_MUG, url: placeholderImage('Mug Side', 800), alt: 'Ceramic Coffee Mug', sortOrder: 0 },
  ]).onConflictDoNothing();

  // ─── Shipping Zones ───────────────────────────────────────────────────

  await db.insert(storeShippingZones).values([
    {
      id: ZONE_EU,
      name: 'European Union',
      countries: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'],
      isDefault: false,
      sortOrder: 0,
    },
    {
      id: ZONE_US,
      name: 'United States',
      countries: ['US'],
      isDefault: false,
      sortOrder: 1,
    },
    {
      id: ZONE_REST,
      name: 'Rest of World',
      countries: [],
      isDefault: true,
      sortOrder: 2,
    },
  ]).onConflictDoNothing();

  // ─── Shipping Rates ───────────────────────────────────────────────────

  await db.insert(storeShippingRates).values([
    // EU
    { zoneId: ZONE_EU, name: 'Standard Shipping', rateCents: 499, freeAboveCents: 5000, estimatedDays: '3-5', sortOrder: 0 },
    { zoneId: ZONE_EU, name: 'Express Shipping', rateCents: 1299, estimatedDays: '1-2', sortOrder: 1 },
    // US
    { zoneId: ZONE_US, name: 'Standard Shipping', rateCents: 799, freeAboveCents: 7500, estimatedDays: '5-8', sortOrder: 0 },
    { zoneId: ZONE_US, name: 'Express Shipping', rateCents: 1999, estimatedDays: '2-3', sortOrder: 1 },
    // Rest of World
    { zoneId: ZONE_REST, name: 'International Shipping', rateCents: 1499, estimatedDays: '7-14', sortOrder: 0 },
  ]).onConflictDoNothing();

  // ─── Tax Rates (EU VAT — major countries) ─────────────────────────────

  await db.insert(storeTaxRates).values([
    { country: 'DE', taxClass: 'standard', rate: '19.00', name: 'MwSt', priceIncludesTax: true },
    { country: 'DE', taxClass: 'reduced', rate: '7.00', name: 'MwSt (ermäßigt)', priceIncludesTax: true },
    { country: 'FR', taxClass: 'standard', rate: '20.00', name: 'TVA', priceIncludesTax: true },
    { country: 'IT', taxClass: 'standard', rate: '22.00', name: 'IVA', priceIncludesTax: true },
    { country: 'ES', taxClass: 'standard', rate: '21.00', name: 'IVA', priceIncludesTax: true },
    { country: 'NL', taxClass: 'standard', rate: '21.00', name: 'BTW', priceIncludesTax: true },
    { country: 'AT', taxClass: 'standard', rate: '20.00', name: 'USt', priceIncludesTax: true },
    { country: 'PL', taxClass: 'standard', rate: '23.00', name: 'VAT', priceIncludesTax: true },
    { country: 'CZ', taxClass: 'standard', rate: '21.00', name: 'DPH', priceIncludesTax: true },
    { country: 'SK', taxClass: 'standard', rate: '20.00', name: 'DPH', priceIncludesTax: true },
    { country: 'SE', taxClass: 'standard', rate: '25.00', name: 'Moms', priceIncludesTax: true },
    { country: 'BE', taxClass: 'standard', rate: '21.00', name: 'BTW/TVA', priceIncludesTax: true },
    { country: 'IE', taxClass: 'standard', rate: '23.00', name: 'VAT', priceIncludesTax: true },
    { country: 'PT', taxClass: 'standard', rate: '23.00', name: 'IVA', priceIncludesTax: true },
    // US — tax excluded from price
    { country: 'US', taxClass: 'standard', rate: '0.00', name: 'Sales Tax', priceIncludesTax: false },
  ]).onConflictDoNothing();

  return {};
}

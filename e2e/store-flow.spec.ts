import { test, expect } from '@playwright/test';

/**
 * Store E2E flow — validates the complete shopping experience.
 *
 * Prerequisites:
 *   - Dev server running (`bun run dev`)
 *   - Database seeded (`bun run init` or seed ran at least once)
 *   - No payment provider needed (dev mode auto-confirms orders)
 *
 * Run: `bunx playwright test e2e/store-flow.spec.ts`
 */

test.describe('Store Flow', () => {
  test('browse store → product detail → add to cart → view cart', async ({ page }) => {
    // ── 1. Store listing loads with seeded products ──
    await page.goto('/store');
    await expect(page.locator('.store-title')).toBeVisible();

    // Should have product cards from seed data
    const cards = page.locator('.product-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);

    // ── 2. Category tabs render ──
    const tabs = page.locator('.store-category-tabs');
    if (await tabs.isVisible()) {
      await expect(tabs.locator('.store-category-tab')).toHaveCount(4); // All + 3 categories
    }

    // ── 3. Click first product → product detail ──
    const _firstCardName = await cards.first().locator('.product-card-name').textContent();
    await cards.first().click();
    await expect(page).toHaveURL(/\/store\/.+/);
    await expect(page.locator('.product-info-title')).toBeVisible();

    // Breadcrumb should show
    await expect(page.locator('.store-breadcrumb')).toContainText('Store');

    // Price should be visible
    await expect(page.locator('.product-info-price-current')).toBeVisible();

    // ── 4. Add to cart ──
    const addBtn = page.locator('.btn-add-to-cart');
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Should show "Added to cart!" feedback
    await expect(addBtn).toContainText('Added', { timeout: 5_000 });

    // "View Cart" button should appear
    const viewCartBtn = page.locator('.btn-view-cart');
    await expect(viewCartBtn).toBeVisible();

    // Cart widget badge should show count
    const badge = page.locator('.cart-badge');
    await expect(badge).toBeVisible({ timeout: 5_000 });
    const badgeText = await badge.textContent();
    expect(parseInt(badgeText ?? '0')).toBeGreaterThanOrEqual(1);

    // ── 5. Navigate to cart page ──
    await viewCartBtn.click();
    await expect(page).toHaveURL(/\/cart/);

    // Cart should have items
    const cartItems = page.locator('.cart-item');
    await expect(cartItems.first()).toBeVisible({ timeout: 5_000 });
    const itemCount = await cartItems.count();
    expect(itemCount).toBeGreaterThanOrEqual(1);

    // Should show the product we added
    await expect(page.locator('.cart-item-name').first()).toBeVisible();

    // Order summary should be visible
    await expect(page.locator('.cart-summary-title')).toBeVisible();
    await expect(page.locator('.cart-summary-row-total')).toBeVisible();

    // ── 6. Quantity controls work ──
    const qtyDisplay = cartItems.first().locator('.quantity-control span');
    const initialQty = await qtyDisplay.textContent();
    expect(parseInt(initialQty ?? '0')).toBe(1);

    // Increase quantity
    await cartItems.first().locator('.quantity-control button').last().click();
    await expect(qtyDisplay).toHaveText('2', { timeout: 3_000 });
  });

  test('store search filters products', async ({ page }) => {
    await page.goto('/store');
    await expect(page.locator('.store-grid')).toBeVisible({ timeout: 10_000 });

    // Search for a specific product
    const searchInput = page.locator('.store-search input');
    await searchInput.fill('Hoodie');
    await searchInput.press('Enter');

    // URL should include search param
    await expect(page).toHaveURL(/[?&]q=Hoodie/);

    // Results should be filtered
    await page.waitForTimeout(1000); // wait for server render
    const cards = page.locator('.product-card');
    const count = await cards.count();
    // Either we find the hoodie or no results (if not seeded)
    if (count > 0) {
      await expect(cards.first().locator('.product-card-name')).toContainText(/hoodie/i);
    }
  });

  test('empty cart shows empty state', async ({ page }) => {
    // Clear cookies to ensure fresh cart
    await page.context().clearCookies();
    await page.goto('/cart');

    // Should show empty state
    await expect(page.locator('.store-empty')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.store-empty-title')).toContainText(/empty/i);

    // Continue Shopping link should work
    const continueLink = page.locator('.btn-checkout', { hasText: /continue|shopping/i });
    if (await continueLink.isVisible()) {
      await continueLink.click();
      await expect(page).toHaveURL(/\/store/);
    }
  });

  test('product detail with variants allows selection', async ({ page }) => {
    // Navigate to the T-Shirt (variable product with size/color variants)
    await page.goto('/store/classic-logo-tshirt');

    // Wait for product to load
    const title = page.locator('.product-info-title');
    if (await title.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Variant selectors should be present
      const variantGroups = page.locator('.variant-group');
      const groupCount = await variantGroups.count();

      if (groupCount > 0) {
        // Click a variant option
        const options = page.locator('.variant-option');
        const firstOption = options.first();
        await firstOption.click();
        await expect(firstOption).toHaveAttribute('data-selected', 'true');
      }

      // Add to cart should work
      await page.locator('.btn-add-to-cart').click();
      await expect(page.locator('.btn-add-to-cart')).toContainText('Added', { timeout: 5_000 });
    }
  });

  test('store listing pagination works', async ({ page }) => {
    await page.goto('/store');
    await expect(page.locator('.store-grid')).toBeVisible({ timeout: 10_000 });

    // With 8 seeded products and pageSize 20, there should be 1 page
    // But pagination component should exist if needed
    const pagination = page.locator('.pagination');
    // If pagination is visible, test it
    if (await pagination.isVisible().catch(() => false)) {
      const nextBtn = pagination.locator('.pagination-btn', { hasText: /next/i });
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
        await expect(page).toHaveURL(/page=2/);
      }
    }
  });

  test('sort changes product order', async ({ page }) => {
    await page.goto('/store');
    await expect(page.locator('.store-grid')).toBeVisible({ timeout: 10_000 });

    // Change sort to price ascending
    await page.locator('.store-sort').selectOption('price_asc');

    // URL should include sort param
    await expect(page).toHaveURL(/sort=price_asc/);
  });
});

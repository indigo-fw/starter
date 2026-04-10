/**
 * Format price from cents to display string.
 */
export function formatPrice(cents: number | null | undefined, currency = 'EUR'): string {
  if (cents == null) return '';
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Get or create a cart session ID from cookie.
 * Used by anonymous users to persist cart across page loads.
 */
export function getCartSessionId(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|; )cart_session=([^;]*)/);
  if (match) return match[1]!;
  const id = crypto.randomUUID();
  document.cookie = `cart_session=${id};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
  return id;
}

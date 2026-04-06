/**
 * Shared click-origin tracker for zoom-from-cursor animations.
 * Used by Dialog to animate open/close from the click point.
 *
 * Registers a single global `pointerdown` listener (capture phase)
 * that records the last click position. Components call `getClickOrigin()`
 * to get a CSS `transform-origin` value relative to the viewport center.
 */

let lastClickX = 0;
let lastClickY = 0;
let trackingActive = false;

function ensureTracking() {
  if (trackingActive || typeof window === 'undefined') return;
  trackingActive = true;
  document.addEventListener(
    'pointerdown',
    (e) => {
      lastClickX = e.clientX;
      lastClickY = e.clientY;
    },
    true,
  );
}

ensureTracking();

/** Returns a CSS `transform-origin` value centered on the last click position. */
export function getClickOrigin(): string {
  if (typeof window === 'undefined') return '50% 50%';
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return `calc(50% + ${lastClickX - vw / 2}px) calc(50% + ${lastClickY - vh / 2}px)`;
}

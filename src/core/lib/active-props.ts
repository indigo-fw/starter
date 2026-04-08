/**
 * Returns className + ARIA attributes for active state.
 * Couples styling with accessibility so neither can be forgotten.
 *
 * Usage:
 *   <Link className={cn('dash-sidebar-link', active && activeClass('nav'))} {...activeAria(active, 'nav')}>
 *   <button className={cn('status-tab', isActive && activeClass('tab'))} {...activeAria(isActive, 'tab')}>
 */

type ActiveRole = 'nav' | 'tab';

/** Returns 'is-active' — use in cn() conditionals */
export function activeClass(_role?: ActiveRole): string {
  return 'is-active';
}

/** Returns ARIA attributes for the given active state and role */
export function activeAria(
  isActive: boolean,
  role: ActiveRole = 'nav',
): Record<string, unknown> {
  if (role === 'tab') {
    return { role: 'tab', 'aria-selected': isActive };
  }
  // nav
  return isActive ? { 'aria-current': 'page' as const } : {};
}

/**
 * Returns className + ARIA attributes for active state.
 * Couples styling with accessibility so neither can be forgotten.
 *
 * Usage:
 *   <Link className={cn('dash-sidebar-link', active && IS_ACTIVE)} {...activeAria(active, 'nav')}>
 *   <button className={cn('status-tab', isActive && IS_ACTIVE)} {...activeAria(isActive, 'tab')}>
 *   <button className={cn('command-result', isActive && IS_ACTIVE)} {...activeAria(isActive, 'option')}>
 */

/** The active state class — use in cn() conditionals */
export const IS_ACTIVE = 'is-active';

type ActiveRole = 'nav' | 'tab' | 'option';

/** Returns ARIA attributes for the given active state and role */
export function activeAria(
  isActive: boolean,
  role: ActiveRole,
): Record<string, unknown> {
  switch (role) {
    case 'nav':
      return isActive ? { 'aria-current': 'page' as const } : {};
    case 'tab':
      return { role: 'tab', 'aria-selected': isActive };
    case 'option':
      return { role: 'option', 'aria-selected': isActive };
  }
}

'use client';

import { useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

import { useThemeStore, isThemeSwitchEnabled } from '@/core/store/theme-store';

const icons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const cycleTheme = useThemeStore((s) => s.cycleTheme);
  const initTheme = useThemeStore((s) => s.initTheme);

  useEffect(() => initTheme(), [initTheme]);

  // Only one mode configured for this scope → no choice to offer.
  if (!isThemeSwitchEnabled()) return null;

  const Icon = icons[theme];

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className="icon-btn"
      aria-label={`Switch theme (current: ${theme})`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

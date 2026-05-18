'use client';

import { useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

import { useThemeStore } from '@/core/store/theme-store';
import { siteConfig } from '@/config/site';

const icons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

const next = {
  light: 'dark',
  dark: 'system',
  system: 'light',
} as const;

export function ThemeToggle() {
  const { theme, setTheme, initTheme } = useThemeStore();

  useEffect(() => {
    return initTheme();
  }, [initTheme]);

  // Theme locked by siteConfig.theme.forced — render no switcher.
  // ThemeToggle is only used in public layouts, so the public lock applies.
  if (siteConfig.theme.forced) return null;

  const Icon = icons[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(next[theme])}
      className="icon-btn"
      aria-label={`Switch to ${next[theme]} theme`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

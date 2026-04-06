'use client';

import { useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

import { useThemeStore } from '@/core/store/theme-store';

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

  const Icon = icons[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(next[theme])}
      className="header-icon-btn"
      aria-label={`Switch to ${next[theme]} theme`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

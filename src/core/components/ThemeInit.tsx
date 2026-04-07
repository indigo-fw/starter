'use client';

import { useEffect } from 'react';

import { useThemeStore } from '@/core/store/theme-store';

/** Reads theme from localStorage and applies dark class. Mount in layouts without AdminSidebar. */
export function ThemeInit() {
  const initTheme = useThemeStore((s) => s.initTheme);

  useEffect(() => {
    return initTheme();
  }, [initTheme]);

  return null;
}

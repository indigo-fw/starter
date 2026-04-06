import { create } from 'zustand';

const DASHBOARD_PREFIX = '/dashboard';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

const LEGACY_KEY = 'indigo-theme';
const ADMIN_KEY = 'indigo-theme-admin';
const PUBLIC_KEY = 'indigo-theme-public';

function detectStorageKey(): string {
  if (typeof window === 'undefined') return PUBLIC_KEY;
  return window.location.pathname.startsWith(DASHBOARD_PREFIX) ? ADMIN_KEY : PUBLIC_KEY;
}

function getStoredTheme(key: string): Theme | null {
  const val = localStorage.getItem(key) as Theme | null;
  if (val) return val;
  // Migration: fallback to legacy key
  return localStorage.getItem(LEGACY_KEY) as Theme | null;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyTheme(resolved: ResolvedTheme) {
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

interface ThemeStore {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: Theme) => void;
  initTheme: () => () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: 'light',
  resolvedTheme: 'light',

  setTheme(t: Theme) {
    const key = detectStorageKey();
    localStorage.setItem(key, t);
    const resolved: ResolvedTheme =
      t === 'system' ? getSystemTheme() : t;
    applyTheme(resolved);
    set({ theme: t, resolvedTheme: resolved });
  },

  initTheme() {
    const key = detectStorageKey();
    const stored = getStoredTheme(key);
    const theme: Theme = stored ?? 'light';
    const resolved: ResolvedTheme =
      theme === 'system' ? getSystemTheme() : theme;
    applyTheme(resolved);
    set({ theme, resolvedTheme: resolved });

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    function onChange() {
      const { theme: current } = get();
      if (current === 'system') {
        const r = getSystemTheme();
        applyTheme(r);
        set({ resolvedTheme: r });
      }
    }
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  },
}));

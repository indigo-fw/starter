import { create } from 'zustand';

import { siteConfig } from '@/config/site';

const DASHBOARD_PREFIX = '/dashboard';

/** A concrete, renderable theme. */
export type ThemeMode = 'light' | 'dark';
/** A selectable state — a concrete theme, or 'system' (follow the OS). */
export type ThemeState = ThemeMode | 'system';

const LEGACY_KEY = 'indigo-theme';
const ADMIN_KEY = 'indigo-theme-admin';
const PUBLIC_KEY = 'indigo-theme-public';

/** The admin dashboard always offers the full light/dark set. */
const ADMIN_MODES: ThemeMode[] = ['light', 'dark'];

function onDashboard(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith(DASHBOARD_PREFIX)
  );
}

/** Renderable themes configured for the current scope (never empty). */
function scopeModes(): ThemeMode[] {
  if (onDashboard()) return ADMIN_MODES;
  const configured: readonly string[] = siteConfig.theme.modes;
  const modes = configured.filter(
    (m): m is ThemeMode => m === 'light' || m === 'dark',
  );
  return modes.length > 0 ? modes : ['light'];
}

function storageKey(): string {
  return onDashboard() ? ADMIN_KEY : PUBLIC_KEY;
}

/** 'system' is meaningful only when both light and dark can satisfy the OS query. */
function systemAvailable(modes: ThemeMode[]): boolean {
  return modes.includes('light') && modes.includes('dark');
}

/** Every state the switcher cycles through, in order. */
function toggleStates(modes: ThemeMode[]): ThemeState[] {
  return systemAvailable(modes) ? [...modes, 'system'] : [...modes];
}

/** The state used when the visitor has made no explicit choice. */
function defaultState(modes: ThemeMode[]): ThemeState {
  return systemAvailable(modes) ? 'system' : modes[0]!;
}

/**
 * Whether the current scope offers a real choice — i.e. the `<ThemeToggle>`
 * should render. A single configured mode is a forced theme: no switcher.
 */
export function isThemeSwitchEnabled(): boolean {
  return scopeModes().length > 1;
}

function getSystemTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Resolve a state to the concrete theme to render. */
function resolve(state: ThemeState): ThemeMode {
  return state === 'system' ? getSystemTheme() : state;
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark');
}

/** Stored state for this scope, validated against the allowed cycle. */
function readStoredState(modes: ThemeMode[]): ThemeState {
  const states = toggleStates(modes) as string[];
  const raw =
    localStorage.getItem(storageKey()) ?? localStorage.getItem(LEGACY_KEY);
  return raw && states.includes(raw)
    ? (raw as ThemeState)
    : defaultState(modes);
}

interface ThemeStore {
  /** The selected state — a concrete mode, or 'system'. */
  theme: ThemeState;
  /** The concrete theme currently applied to the document. */
  resolvedTheme: ThemeMode;
  /** Switch to a specific state (ignored when the theme is locked). */
  setTheme: (state: ThemeState) => void;
  /** Advance to the next state in the scope's cycle. */
  cycleTheme: () => void;
  /** Apply the stored/default theme; returns a cleanup fn. */
  initTheme: () => () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: 'light',
  resolvedTheme: 'light',

  setTheme(state) {
    const modes = scopeModes();
    // Single configured mode → locked; nothing to switch to.
    if (modes.length <= 1) return;
    if (!toggleStates(modes).includes(state)) return;
    localStorage.setItem(storageKey(), state);
    const resolved = resolve(state);
    applyTheme(resolved);
    set({ theme: state, resolvedTheme: resolved });
  },

  cycleTheme() {
    const modes = scopeModes();
    if (modes.length <= 1) return;
    const states = toggleStates(modes);
    const i = states.indexOf(get().theme);
    get().setTheme(states[(i + 1) % states.length]!);
  },

  initTheme() {
    const modes = scopeModes();

    // Locked to a single mode — apply it, skip storage + system listener.
    if (modes.length <= 1) {
      const only = modes[0]!;
      applyTheme(only);
      set({ theme: only, resolvedTheme: only });
      return () => {};
    }

    const state = readStoredState(modes);
    const resolved = resolve(state);
    applyTheme(resolved);
    set({ theme: state, resolvedTheme: resolved });

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    function onChange() {
      if (get().theme === 'system') {
        const r = getSystemTheme();
        applyTheme(r);
        set({ resolvedTheme: r });
      }
    }
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  },
}));

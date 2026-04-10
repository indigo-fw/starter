'use client';

import { useEffect, useRef } from 'react';

import { trpc } from '@/lib/trpc/client';
import { usePreferencesStore } from '@/core/store/preferences-store';
import { useThemeStore } from '@/core/store/theme-store';

const ADMIN_THEME_KEY = 'indigo-theme-admin';

/**
 * Hydrates the preferences Zustand store from the DB via tRPC.
 * Also syncs the admin theme preference from DB → localStorage for cross-device consistency.
 * Also triggers geo sync (country/state/timezone from IP) once per session.
 * Renders nothing — mount once in the dashboard layout.
 */
export function PreferencesHydrator() {
  const didHydrate = useRef(false);
  const didGeoSync = useRef(false);
  const hydrate = usePreferencesStore((s) => s.hydrate);
  const utils = trpc.useUtils();
  const setTheme = useThemeStore((s) => s.setTheme);
  const geoSync = trpc.auth.syncGeo.useMutation();

  const { data } = trpc.users.getPreferences.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Geo sync — once per session (fire-and-forget)
  useEffect(() => {
    if (didGeoSync.current) return;
    didGeoSync.current = true;
    geoSync.mutate(undefined, {
      onError: (err) => console.warn('[GeoSync]', err.message),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount
  }, []);

  useEffect(() => {
    if (!data || didHydrate.current) return;
    didHydrate.current = true;

    hydrate(data, (key: string, value: unknown) => {
      // Fire-and-forget DB persist
      utils.client.users.setPreference.mutate({ key, value }).catch((err: unknown) => {
        console.warn('[Preferences] Failed to persist preference', key, err);
      });
    });

    // Sync DB theme → localStorage (DB wins for cross-device consistency)
    const dbTheme = (data as Record<string, unknown>)?.['theme.admin'] as string | undefined;
    if (dbTheme && (dbTheme === 'light' || dbTheme === 'dark' || dbTheme === 'system')) {
      const localTheme = localStorage.getItem(ADMIN_THEME_KEY);
      if (localTheme !== dbTheme) {
        setTheme(dbTheme);
      }
    }
  }, [data, hydrate, utils, setTheme]);

  return null;
}

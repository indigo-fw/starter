'use client';

import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc/client';

/**
 * Syncs user geo data (country, state, timezone, currency) once per session.
 * Fire-and-forget — updates the user record if IP changed or geo fields are missing.
 * Renders nothing. Mount in any authenticated layout.
 */
export function GeoSyncer() {
  const didSync = useRef(false);
  const geoSync = trpc.auth.syncGeo.useMutation();

  useEffect(() => {
    if (didSync.current) return;
    didSync.current = true;
    geoSync.mutate(undefined, {
      onError: (err) => console.warn('[GeoSync]', err.message),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount
  }, []);

  return null;
}

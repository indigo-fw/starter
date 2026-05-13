'use client';

import { useEffect, useRef } from 'react';

/**
 * Fire-and-forget timezone reporter — populates `user.timezone`.
 *
 * The schema has a `user.timezone` column but nothing fills it. Mount this in
 * your authenticated layout. On first paint, if the server-rendered
 * `currentTz` is empty, it detects the browser's IANA timezone
 * (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and hands it to your
 * `onDetect` server action. A `useRef` guard makes it run at most once per
 * mount so SPA navigation doesn't re-fire it.
 *
 * Why the action is a prop rather than a built-in core action: persisting
 * `user.timezone` needs the *session* (to know which user to write), and core
 * can't import the project's auth layer. So the project supplies a tiny
 * `'use server'` action that does the session check + write — and crucially
 * should only write when `currentTz` is empty, so it never clobbers a value
 * the user later picked in Settings. Example:
 *
 *   // src/app/(app)/timezone-action.ts
 *   'use server';
 *   export async function persistTimezone(tz: string) {
 *     const s = await auth.api.getSession({ headers: await headers() });
 *     if (!s?.user) return;
 *     if (!/^[A-Za-z0-9_+\-\/]{3,64}$/.test(tz)) return;
 *     await db.update(user).set({ timezone: tz })
 *       .where(and(eq(user.id, s.user.id), isNull(user.timezone)));
 *   }
 *
 *   // in the layout (server component):
 *   <TimezoneSync currentTz={row?.timezone ?? null} onDetect={persistTimezone} />
 */
export function TimezoneSync({
  currentTz,
  onDetect,
}: {
  currentTz: string | null;
  onDetect: (tz: string) => Promise<void> | void;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || currentTz) return;
    sent.current = true;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    void onDetect(tz);
  }, [currentTz, onDetect]);
  return null;
}

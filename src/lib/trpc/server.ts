import { cache } from 'react';

import { headers } from 'next/headers';
import 'server-only';

import { appRouter } from '@/server/routers/_app';
import { createTRPCContext } from '@/server/trpc';

/** Server-side tRPC caller, cached per request */
export const createServerCaller = cache(async () => {
  const headersList = await headers();
  const context = await createTRPCContext({
    headers: headersList,
  });
  return appRouter.createCaller(context);
});

/** Convenience alias */
export const serverTRPC = createServerCaller;

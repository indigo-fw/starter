import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { appRouter } from '@/server/routers/_app';
import { createTRPCContext, logTrpcError } from '@/server/trpc';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
    // Procedure failures are already logged by the logging middleware in
    // src/server/trpc.ts (and marked, so this stays quiet for them). What's
    // left here are failures that never reach a procedure: context creation,
    // unknown paths, malformed batches.
    onError: ({ path, type, error }) => {
      logTrpcError(error, { path, type });
    },
  });

export { handler as GET, handler as POST };

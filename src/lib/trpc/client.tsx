'use client';

import type { AppRouter } from '../../server/routers/_app';
import { createTRPCReact } from '@trpc/react-query';

/** Client-side tRPC React hooks */
export const trpc = createTRPCReact<AppRouter>();

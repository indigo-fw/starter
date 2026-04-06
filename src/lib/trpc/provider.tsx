'use client';

import { useState } from 'react';

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { httpBatchStreamLink } from '@trpc/client';
import superjson from 'superjson';

import { trpc } from './client';
import { adminRoutes } from '@/config/routes';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

/** Redirect to /login on UNAUTHORIZED — prevents infinite loading spinner */
function handleAuthError(error: unknown) {
  if (typeof window === 'undefined') return;
  const trpcError = error as { data?: { code?: string } } | undefined;
  if (trpcError?.data?.code === 'UNAUTHORIZED') {
    window.location.href = adminRoutes.login;
  }
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            refetchOnWindowFocus: false,
            retry(failureCount, error) {
              const trpcError = error as { data?: { code?: string } } | undefined;
              // Don't retry auth errors — redirect instead
              if (trpcError?.data?.code === 'UNAUTHORIZED') return false;
              if (trpcError?.data?.code === 'FORBIDDEN') return false;
              return failureCount < 2;
            },
          },
          mutations: {
            retry: false,
          },
        },
        queryCache: new QueryCache({
          onError: (error) => {
            handleAuthError(error);
          },
        }),
        mutationCache: new MutationCache({
          onError: (error) => {
            handleAuthError(error);
          },
        }),
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchStreamLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          headers: () => {
            const headers = new Headers();
            headers.set('x-trpc-source', 'nextjs-react');
            return headers;
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

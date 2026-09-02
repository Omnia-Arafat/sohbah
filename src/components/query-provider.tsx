"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Query defaults for an app that deliberately does not update itself.
 *
 * Everything that could refetch in the background is off. A page shows the data
 * it was loaded with, and the only way to see somebody else's changes is to
 * refresh — which is the intended behaviour, not an oversight:
 *
 *   staleTime: Infinity   nothing is ever considered stale, so nothing refetches
 *   refetchOnMount         a remount reuses the cache instead of hitting the DB
 *   refetchOnWindowFocus   switching tabs back does not silently change the list
 *   refetchOnReconnect     neither does a dropped connection coming back
 *   refetchInterval        no polling
 *
 * A user's *own* action still updates their screen immediately: mutations write
 * to the cache directly. What is suppressed is other people's changes arriving
 * unannounced.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchInterval: false,
        retry: 1,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // Created in state, not at module scope: a module-level client would be
  // shared across requests on the server and leak one user's data into
  // another's cache.
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

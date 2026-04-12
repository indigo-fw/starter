'use client';

/**
 * Typed wrapper around tRPC sites router hooks.
 *
 * Eliminates `(trpc as any).sites` in components. The cast happens once here
 * instead of scattered across every template/component file.
 *
 * Usage:
 *   const { list, getById, create, update, suspend, ... } = useSitesApi();
 *   const { data } = list.useQuery();
 *   const mutation = create.useMutation();
 */

import { trpc } from '@/lib/trpc/client';
import type { SiteSettings } from '@/core-multisite/schema/sites';

// ── Return types inferred from the router ─────────────────────────────────

export interface SiteListItem {
  id: string;
  name: string;
  slug: string;
  status: number;
  isNetworkAdmin: boolean;
  createdAt: Date;
}

export interface SiteDetail {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  defaultLocale: string;
  locales: string[];
  status: number;
  settings: SiteSettings;
  isNetworkAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  domains: SiteDomain[];
  members: SiteMember[];
}

export interface SiteDomain {
  id: string;
  siteId: string;
  domain: string;
  isPrimary: boolean;
  verified: boolean;
  verificationToken: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface SiteMember {
  userId: string;
  role: string;
  createdAt: Date;
}

export interface SiteStats {
  activeSites: number;
  suspendedSites: number;
  totalDomains: number;
  verifiedDomains: number;
  totalMembers: number;
}

// ── Hook type wrappers ────────────────────────────────────────────────────

interface UseQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: { message: string } | null;
}

interface UseMutationResult<TInput, TOutput> {
  mutateAsync: (input: TInput) => Promise<TOutput>;
  isPending: boolean;
  error: { message: string } | null;
}

interface QueryHook<TInput, TOutput> {
  useQuery: (input: TInput) => UseQueryResult<TOutput>;
}

interface QueryHookNoInput<TOutput> {
  useQuery: () => UseQueryResult<TOutput>;
}

interface MutationHook<TInput, TOutput> {
  useMutation: () => UseMutationResult<TInput, TOutput>;
}

// ── The typed API ─────────────────────────────────────────────────────────

interface SitesApi {
  list: QueryHookNoInput<SiteListItem[]>;
  getById: QueryHook<{ id: string }, SiteDetail>;
  stats: QueryHookNoInput<SiteStats>;
  create: MutationHook<{ name: string; slug?: string; defaultLocale?: string; locales?: string[] }, SiteDetail>;
  update: MutationHook<{ id: string; name?: string; defaultLocale?: string; locales?: string[]; settings?: Record<string, unknown> }, SiteDetail>;
  suspend: MutationHook<{ id: string }, { success: true }>;
  unsuspend: MutationHook<{ id: string }, { success: true }>;
  softDelete: MutationHook<{ id: string }, { success: true }>;
  restore: MutationHook<{ id: string }, { success: true }>;
  hardDelete: MutationHook<{ id: string }, { success: true }>;
  clone: MutationHook<{ sourceSiteId: string; name: string; slug?: string }, SiteDetail>;
  addDomain: MutationHook<{ siteId: string; domain: string; isPrimary?: boolean }, SiteDomain & { verificationInstruction: string }>;
  removeDomain: MutationHook<{ id: string }, { success: true }>;
  listDomains: QueryHook<{ siteId: string }, SiteDomain[]>;
  addMember: MutationHook<{ siteId: string; userId: string; role?: 'admin' | 'editor' | 'viewer' }, SiteMember>;
  removeMember: MutationHook<{ siteId: string; userId: string }, { success: true }>;
  setActive: MutationHook<{ siteId: string | null }, { siteId: string | null }>;
}

/**
 * Returns typed tRPC hooks for the sites router.
 * Module routers are dynamically registered, so TypeScript can't see them on `trpc`.
 * This hook does the unsafe cast once and exposes a clean typed API.
 */
export function useSitesApi(): SitesApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (trpc as any).sites as SitesApi;
}

/** Typed access to trpc.useUtils() for sites router invalidation */
export function useSitesUtils() {
  return trpc.useUtils();
}

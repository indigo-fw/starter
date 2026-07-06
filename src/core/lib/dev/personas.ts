/**
 * Test personas — a fixed, documented cast of users for agent-driven and
 * manual testing. Seeded by `bun run indigo personas` (dev-only).
 *
 * Each persona gets: a user with a known email/password, a personal org,
 * an MCP API key written to `.env.local` as `INDIGO_MCP_KEY_<ID>`, and —
 * when the subscriptions module is installed — the declared plan state.
 *
 * The password is shared and fixed so browser-level tests (Playwright
 * storage states, manual logins) can authenticate without secrets plumbing.
 * These accounts must never exist in production; the seeder refuses to run
 * when NODE_ENV is 'production'.
 */

export const PERSONA_PASSWORD = 'indigo-test-1234';

export interface Persona {
  /** Stable id — env var suffix (INDIGO_MCP_KEY_<ID>) and .mcp.json entry name. */
  id: string;
  email: string;
  name: string;
  /** Role set after signup. */
  role: 'user' | 'admin' | 'superadmin';
  /** Subscription plan for the personal org (requires core-subscriptions), or null. */
  planId: string | null;
  /** What this persona is for — shown in the seeder summary. */
  purpose: string;
}

export const PERSONAS: Persona[] = [
  {
    id: 'free',
    email: 'free@test.local',
    name: 'Freda Free',
    role: 'user',
    planId: null,
    purpose: 'Registered, no subscription — tests the free tier and upgrade prompts.',
  },
  {
    id: 'pro',
    email: 'pro@test.local',
    name: 'Priya Pro',
    role: 'user',
    planId: 'pro',
    purpose: 'Registered with an active paid plan — tests paid features and entitlements.',
  },
  {
    id: 'admin',
    email: 'admin-persona@test.local',
    name: 'Adam Admin',
    role: 'admin',
    planId: null,
    purpose: 'Staff role — tests the admin panel surface without superadmin power.',
  },
  {
    id: 'super',
    email: 'super@test.local',
    name: 'Sunna Super',
    role: 'superadmin',
    planId: null,
    purpose: 'Full power — tests superadmin-only operations.',
  },
];

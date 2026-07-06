/**
 * `bun run indigo personas` — seed the test-persona cast (dev-only).
 *
 * For each persona in `src/core/lib/dev/personas.ts`:
 *   1. Creates the user via Better Auth signup (personal org comes from the
 *      user-created hook), or reuses the existing user.
 *   2. Sets role + marks email verified.
 *   3. Ensures the declared subscription state (if core-subscriptions is
 *      installed) on the personal org.
 *   4. Mints an org-scoped MCP API key and writes it to `.env.local` as
 *      `INDIGO_MCP_KEY_<ID>` (skipped if already present).
 *
 * Idempotent — re-running converges to the declared state. Agents switch
 * persona by picking the matching server entry in `.mcp.json`.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { asc, eq } from 'drizzle-orm';

export interface PersonaOptions {
  /**
   * Wipe persona users + their organizations first (FK cascades take all
   * org-scoped data: keys, subscriptions, module tables), strip the env
   * keys, then re-seed fresh. This is the state-reset agents need between
   * test scenarios — personas are enthusiastic mutators' punching bags.
   */
  reset?: boolean;
}

export async function seedPersonas(opts: PersonaOptions = {}): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('✗ Personas are test fixtures — refusing to seed in production.');
    process.exit(1);
  }

  // Deferred imports: this file is loaded by the CLI dispatcher for every
  // command, but auth/db must only initialise when personas actually runs.
  const { auth } = await import('../../src/lib/auth');
  const { db } = await import('../../src/server/db');
  const { user: userTable } = await import('../../src/server/db/schema/auth');
  const { member, organization } = await import('../../src/server/db/schema/organization');
  // core-api is optional — computed specifiers (and loose types) so typecheck
  // passes on installs without it; the runtime guard gives a friendly error.
  const coreApiBase = '../../src/core-api';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let saasApiKeys: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let generateApiKey: any;
  try {
    ({ saasApiKeys } = await import(`${coreApiBase}/schema/api-keys`));
    ({ generateApiKey } = await import(`${coreApiBase}/lib/api-key-service`));
  } catch {
    console.error('personas requires the core-api module (MCP keys) — install it with `bun run indigo add core-api`.');
    process.exit(1);
  }
  const { MCP_SCOPE } = await import('../../src/core/lib/mcp/auth');
  const { PERSONAS, PERSONA_PASSWORD } = await import('../../src/core/lib/dev/personas');

  const root = process.cwd();
  const envPath = resolve(root, '.env.local');
  const summary: Array<{ persona: string; user: string; org: string; key: string; plan: string }> = [];

  // ─── Optional reset: wipe personas + their orgs, then fall through to seed ─
  if (opts.reset) {
    console.log('  Resetting personas — wiping users + owned organizations...');
    for (const persona of PERSONAS) {
      const [u] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .where(eq(userTable.email, persona.email))
        .limit(1);
      if (!u) continue;

      // Only orgs the persona OWNS — deleting a shared org someone invited
      // the persona into would nuke real data. FK cascades clean out all
      // org-scoped rows (keys, subscriptions, module tables).
      const owned = await db
        .select({ organizationId: member.organizationId, role: member.role })
        .from(member)
        .where(eq(member.userId, u.id));
      for (const m of owned) {
        if (m.role !== 'owner') continue;
        await db.delete(organization).where(eq(organization.id, m.organizationId));
      }

      // User deletion cascades sessions/accounts/memberships.
      await db.delete(userTable).where(eq(userTable.id, u.id));
    }
    stripEnvKeys(envPath, PERSONAS.map((p) => `INDIGO_MCP_KEY_${p.id.toUpperCase()}`));
    console.log('  Wipe complete — re-seeding fresh personas.\n');
  }

  for (const persona of PERSONAS) {
    // ─── 1. User ────────────────────────────────────────────────────────────
    let [u] = await db
      .select({ id: userTable.id, role: userTable.role })
      .from(userTable)
      .where(eq(userTable.email, persona.email))
      .limit(1);

    let userStatus = 'existing';
    if (!u) {
      await auth.api.signUpEmail({
        body: { email: persona.email, password: PERSONA_PASSWORD, name: persona.name },
      });
      [u] = await db
        .select({ id: userTable.id, role: userTable.role })
        .from(userTable)
        .where(eq(userTable.email, persona.email))
        .limit(1);
      userStatus = 'created';
    }
    if (!u) {
      console.error(`  ✗ ${persona.id}: signup did not produce a user — skipping`);
      continue;
    }

    // ─── 2. Role + verified email (skip the verification grace-period gate) ─
    await db
      .update(userTable)
      .set({ role: persona.role, emailVerified: true })
      .where(eq(userTable.id, u.id));

    // ─── 3. Personal org (oldest membership — created by the signup hook) ──
    const [membership] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.userId, u.id))
      .orderBy(asc(member.createdAt), asc(member.id))
      .limit(1);

    if (!membership) {
      console.error(`  ✗ ${persona.id}: user has no organization — skipping key/plan`);
      continue;
    }
    const orgId = membership.organizationId;

    // ─── 4. Subscription state (only if the module is installed) ───────────
    let planStatus = persona.planId ? 'module-missing' : '—';
    if (persona.planId) {
      try {
        const { saasSubscriptions } = await import('../../src/core-subscriptions/schema/subscriptions');
        const [existing] = await db
          .select({ id: saasSubscriptions.id })
          .from(saasSubscriptions)
          .where(eq(saasSubscriptions.organizationId, orgId))
          .limit(1);

        const period = {
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        };
        if (existing) {
          await db
            .update(saasSubscriptions)
            .set({ planId: persona.planId, status: 'active', interval: 'monthly', ...period })
            .where(eq(saasSubscriptions.id, existing.id));
          planStatus = `${persona.planId} (updated)`;
        } else {
          await db.insert(saasSubscriptions).values({
            organizationId: orgId,
            providerId: 'dev',
            providerCustomerId: `dev-persona-${persona.id}`,
            providerSubscriptionId: `dev-persona-sub-${persona.id}`,
            planId: persona.planId,
            interval: 'monthly',
            status: 'active',
            ...period,
          });
          planStatus = `${persona.planId} (created)`;
        }
      } catch {
        // core-subscriptions not installed — persona works, just without a plan.
      }
    }

    // ─── 5. MCP key → .env.local ────────────────────────────────────────────
    const envVar = `INDIGO_MCP_KEY_${persona.id.toUpperCase()}`;
    let keyStatus = 'kept';
    if (!envFileHasKey(envPath, envVar)) {
      // Env var missing — any previous persona key row is orphaned (plaintext
      // is unrecoverable). Replace rather than accumulate.
      await db
        .delete(saasApiKeys)
        .where(eq(saasApiKeys.name, `persona-${persona.id}`));

      const { key, hash, prefix } = generateApiKey();
      await db.insert(saasApiKeys).values({
        organizationId: orgId,
        createdBy: u.id,
        name: `persona-${persona.id}`,
        keyHash: hash,
        prefix,
        scopes: [MCP_SCOPE],
        status: 'active',
      });
      appendEnvVar(envPath, envVar, key);
      keyStatus = 'minted';
    }

    summary.push({ persona: persona.id, user: userStatus, org: orgId.slice(0, 8), key: keyStatus, plan: planStatus });
  }

  console.log('\n  Personas ready (password for browser logins: see src/core/lib/dev/personas.ts):\n');
  for (const row of summary) {
    console.log(`    ${row.persona.padEnd(7)} user:${row.user.padEnd(9)} org:${row.org}  key:${row.key.padEnd(7)} plan:${row.plan}`);
  }
  console.log('\n  Agents switch persona via the matching .mcp.json server entry (indigo-free, indigo-pro, ...).');
}

function envFileHasKey(envPath: string, key: string): boolean {
  if (!existsSync(envPath)) return false;
  return new RegExp(`^\\s*${key}\\s*=`, 'm').test(readFileSync(envPath, 'utf-8'));
}

/** Remove the given env vars' lines (used by --reset before re-minting). */
function stripEnvKeys(envPath: string, keys: string[]): void {
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split(/\r?\n/);
  const filtered = lines.filter((line) => !keys.some((k) => new RegExp(`^\\s*${k}\\s*=`).test(line)));
  writeFileSync(envPath, filtered.join('\n'));
}

function appendEnvVar(envPath: string, key: string, value: string): void {
  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
  const sep = existing.length && !existing.endsWith('\n') ? '\n' : '';
  writeFileSync(envPath, `${existing}${sep}${key}=${value}\n`);
}

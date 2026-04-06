/**
 * Seed Demo Users & Organizations
 *
 * Core framework seed — creates demo users and organizations that
 * module seeds can reference. Runs before any module seeds.
 *
 * Uses faker seed(42) for deterministic output.
 * Safe to run multiple times — skips if demo users already exist.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { count } from 'drizzle-orm';
import crypto from 'crypto';
import { faker } from '@faker-js/faker';
import { hashPassword } from '@/lib/password';
import { log } from './helpers';

const SEED = 42;
const NUM_CUSTOMERS = 20;
const NUM_ORGS = 12;

function uuid(): string {
  return crypto.randomUUID();
}

function pick<T>(arr: T[]): T {
  return faker.helpers.arrayElement(arr);
}

export interface UsersOrgsResult {
  userIds: string[];
  orgIds: string[];
}

export async function seedUsersAndOrgs(
  db: PostgresJsDatabase,
  superadminUserId: string,
): Promise<UsersOrgsResult> {
  faker.seed(SEED);

  const { user, account } = await import('@/server/db/schema/auth');
  const { organization, member } = await import('@/server/db/schema/organization');

  // Idempotency: check if demo users exist (more than just superadmin)
  const [userCount] = await db.select({ count: count() }).from(user);
  if ((userCount?.count ?? 0) > 1) {
    // Existing users — collect their IDs for module seeds
    const existingUsers = await db.select({ id: user.id }).from(user).limit(NUM_CUSTOMERS + 5);
    const existingOrgs = await db.select({ id: organization.id }).from(organization).limit(NUM_ORGS + 5);
    log('\u23ED\uFE0F', 'Demo users already exist. Reusing existing IDs.');
    return {
      userIds: existingUsers.map((u) => u.id).filter((id) => id !== superadminUserId),
      orgIds: existingOrgs.map((o) => o.id),
    };
  }

  // ─── 1. Customers ─────────────────────────────────────────────────
  log('\uD83D\uDC64', `Creating ${NUM_CUSTOMERS} demo customers...`);
  const hashedPw = await hashPassword('demo1234');
  const userIds: string[] = [];

  for (let i = 0; i < NUM_CUSTOMERS; i++) {
    const id = uuid();
    userIds.push(id);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    await db.insert(user).values({
      id,
      name: `${firstName} ${lastName}`,
      email: faker.internet.email({ firstName, lastName }).toLowerCase(),
      emailVerified: faker.datatype.boolean(0.8),
      image: faker.image.avatar(),
      role: 'user',
      createdAt: faker.date.past({ years: 1 }),
    }).onConflictDoNothing();

    await db.insert(account).values({
      id: uuid(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: hashedPw,
    }).onConflictDoNothing();
  }
  log('\u2705', `${NUM_CUSTOMERS} customers created.`);

  // ─── 2. Organizations ─────────────────────────────────────────────
  log('\uD83C\uDFE2', `Creating ${NUM_ORGS} organizations...`);
  const orgIds: string[] = [];

  for (let i = 0; i < NUM_ORGS; i++) {
    const orgId = uuid();
    orgIds.push(orgId);
    const companyName = faker.company.name();

    await db.insert(organization).values({
      id: orgId,
      name: companyName,
      slug: faker.helpers.slugify(companyName).toLowerCase().slice(0, 40),
      logo: faker.image.urlPicsumPhotos({ width: 64, height: 64 }),
      createdAt: faker.date.past({ years: 1 }),
    }).onConflictDoNothing();

    // First org owned by superadmin, rest by demo users
    const ownerId = i === 0 ? superadminUserId : userIds[i % userIds.length]!;

    await db.insert(member).values({
      id: uuid(),
      organizationId: orgId,
      userId: ownerId,
      role: 'owner',
      createdAt: faker.date.past({ years: 1 }),
    }).onConflictDoNothing();

    // 1-3 extra members
    const extraMembers = faker.number.int({ min: 1, max: 3 });
    for (let m = 0; m < extraMembers; m++) {
      const memberIdx = (i + m + NUM_ORGS) % userIds.length;
      await db.insert(member).values({
        id: uuid(),
        organizationId: orgId,
        userId: userIds[memberIdx]!,
        role: pick(['member', 'member', 'admin']),
        createdAt: faker.date.past({ years: 1 }),
      }).onConflictDoNothing();
    }
  }
  log('\u2705', `${NUM_ORGS} organizations created.`);

  return { userIds, orgIds };
}

/**
 * Indigo Change Password Script
 *
 * Change a user's password by email:
 *   bun run change-password <email>
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq } from 'drizzle-orm';
import crypto from 'crypto';
import * as readline from 'readline';
import { hashPassword } from '@/lib/password';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: bun run change-password <email>');
  process.exit(1);
}

function promptPassword(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const sql = postgres(DATABASE_URL!);
  const db = drizzle(sql);

  try {
    const { user, account } = await import('../server/db/schema/auth');

    // Find the user
    const [found] = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (!found) {
      console.error(`No user found with email "${email}".`);
      process.exit(1);
    }

    console.log(`User: "${found.name}" <${found.email}>`);

    const password = await promptPassword('New password (min 6 chars): ');
    if (!password || password.length < 6) {
      console.error('Password must be at least 6 characters.');
      process.exit(1);
    }

    const confirm = await promptPassword('Confirm password: ');
    if (password !== confirm) {
      console.error('Passwords do not match.');
      process.exit(1);
    }

    const hashedPassword = await hashPassword(password);

    // Update or create credential account
    const [existingAccount] = await db
      .select({ id: account.id })
      .from(account)
      .where(
        and(
          eq(account.userId, found.id),
          eq(account.providerId, 'credential')
        )
      )
      .limit(1);

    if (existingAccount) {
      await db
        .update(account)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(eq(account.id, existingAccount.id));
    } else {
      await db.insert(account).values({
        id: crypto.randomUUID(),
        accountId: found.id,
        providerId: 'credential',
        userId: found.id,
        password: hashedPassword,
      });
    }

    console.log(`Password updated for "${found.name}" <${found.email}>.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});

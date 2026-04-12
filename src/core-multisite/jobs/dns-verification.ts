/**
 * DNS TXT record verification job.
 * Periodically checks pending domain verifications by querying DNS TXT records
 * for the expected `indigo-verify={token}` value.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { siteDomains } from '@/core-multisite/schema/sites';
import { createLogger } from '@/core/lib/infra/logger';
import { createQueue, createWorker } from '@/core/lib/infra/queue';
import { invalidateSiteCache } from '@/core-multisite/lib/site-resolver';

const log = createLogger('dns-verification');
const QUEUE_NAME = 'dns-verification';
const JOB_INTERVAL = 5 * 60 * 1000; // 5 minutes

/** Resolve DNS TXT records for a domain */
async function getTxtRecords(domain: string): Promise<string[]> {
  try {
    const { Resolver } = await import('node:dns/promises');
    const resolver = new Resolver();
    const records = await resolver.resolveTxt(domain);
    // TXT records are arrays of chunks — join each record
    return records.map((chunks) => chunks.join(''));
  } catch {
    return [];
  }
}

/** Check a single domain's verification status */
async function verifyDomain(domainRow: { id: string; domain: string; verificationToken: string | null }): Promise<boolean> {
  if (!domainRow.verificationToken) return false;

  const expectedValue = `indigo-verify=${domainRow.verificationToken}`;
  const txtRecords = await getTxtRecords(domainRow.domain);

  return txtRecords.some((record) => record.trim() === expectedValue);
}

/** Process all pending domain verifications */
async function processPendingVerifications(): Promise<void> {
  const pendingDomains = await db
    .select({
      id: siteDomains.id,
      domain: siteDomains.domain,
      siteId: siteDomains.siteId,
      verificationToken: siteDomains.verificationToken,
    })
    .from(siteDomains)
    .where(eq(siteDomains.verified, false))
    .limit(100);

  if (pendingDomains.length === 0) return;

  log.info(`Checking ${pendingDomains.length} pending domain verifications`);

  for (const domainRow of pendingDomains) {
    try {
      const isVerified = await verifyDomain(domainRow);
      if (isVerified) {
        await db
          .update(siteDomains)
          .set({ verified: true, verifiedAt: new Date() })
          .where(eq(siteDomains.id, domainRow.id));

        invalidateSiteCache(domainRow.domain);
        log.info(`Domain verified: ${domainRow.domain}`);
      }
    } catch (err) {
      log.error(`DNS check failed for ${domainRow.domain}`, { error: String(err) });
    }
  }
}

/** Start the DNS verification worker */
export function startDnsVerificationWorker(): void {
  try {
    const queue = createQueue(QUEUE_NAME);
    if (!queue) {
      // Fallback: use setInterval if no BullMQ
      setInterval(() => {
        processPendingVerifications().catch((err) =>
          log.error('DNS verification cycle failed', { error: String(err) })
        );
      }, JOB_INTERVAL);
      log.info('DNS verification started (interval fallback)');
      return;
    }

    // Add repeatable job
    queue.add('check-dns', {}, {
      repeat: { every: JOB_INTERVAL },
      removeOnComplete: 10,
      removeOnFail: 50,
    });

    // Create worker to process the job
    createWorker(QUEUE_NAME, async () => {
      await processPendingVerifications();
    });

    log.info('DNS verification worker started');
  } catch (err) {
    log.error('Failed to start DNS verification worker', { error: String(err) });
  }
}

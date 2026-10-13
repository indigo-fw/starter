/**
 * Re-arm BullMQ repeatable job schedules by hand.
 *
 * Workers self-register their schedules when they start (`ensure*Schedule`
 * exports next to each worker), so a normal deploy needs no manual step. Run
 * this only to re-arm after wiping Redis without restarting the app:
 *   bun run src/scripts/schedule-jobs.ts
 *
 * Idempotent. Schedule ids/intervals live with the workers — never duplicate
 * them here.
 */
import { ensureContentPublishSchedule } from '@/core/lib/content/scheduled-publish';

type ScheduleFn = () => Promise<boolean>;

/**
 * core-support is optional: a computed specifier keeps typecheck green on
 * installs without it, and the runtime miss is simply "nothing to arm".
 */
async function loadSupportChatSchedule(): Promise<ScheduleFn | null> {
  const supportBase = '../core-support';
  try {
    const mod: unknown = await import(`${supportBase}/jobs/support-chat`);
    const fn = (mod as { ensureSupportChatCleanupSchedule?: unknown })
      .ensureSupportChatCleanupSchedule;
    return typeof fn === 'function' ? (fn as ScheduleFn) : null;
  } catch {
    return null;
  }
}

async function main() {
  if (!(await ensureContentPublishSchedule())) {
    console.log('No Redis — skipping job scheduling');
    process.exit(0);
  }
  const armed = ['content-publish'];

  const ensureSupportChat = await loadSupportChatSchedule();
  if (ensureSupportChat && (await ensureSupportChat())) {
    armed.push('support-chat-cleanup');
  }

  console.log(`Job schedules registered: ${armed.join(', ')}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to schedule jobs:', err);
  process.exit(1);
});

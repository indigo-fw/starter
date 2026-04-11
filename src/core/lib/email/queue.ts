/**
 * Email queue + worker — enqueue emails via BullMQ with SMTP fallback.
 */

import { createQueue, createWorker } from '../infra/queue';
import { createLogger } from '../infra/logger';
import { sendEmail, isValidEmail } from './transport';
import { renderTemplate } from './template';
import { getEmailDeps } from './deps';

const logger = createLogger('Email');

// ---------------------------------------------------------------------------
// Job payloads
// ---------------------------------------------------------------------------

interface EmailJob {
  to: string;
  template: string;
  data: Record<string, string>;
  locale: string;
}

interface RawEmailJob {
  to: string;
  subject: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

const emailQueue = createQueue('email');

/**
 * Enqueue a templated email.
 * Validates recipients, carries locale through the queue for template resolution.
 */
export async function enqueueTemplateEmail(
  to: string | string[],
  template: string,
  vars: Record<string, string>,
  locale = 'en',
): Promise<void> {
  const recipients = Array.isArray(to) ? to : [to];
  const valid = recipients.filter((e) => isValidEmail(e));

  if (valid.length === 0) {
    logger.warn('No valid recipients, skipping enqueue', { template, to: recipients });
    return;
  }

  if (emailQueue) {
    await emailQueue.add('send-template', {
      to: valid.join(','),
      template,
      data: vars,
      locale,
    } satisfies EmailJob, {
      attempts: 6,
      backoff: { type: 'exponential', delay: 5 * 60_000 },
    });
  } else {
    // No Redis — render and send synchronously in dev
    logger.info(`Sending directly (no Redis): ${template} -> ${valid.join(', ')}`);
    const deps = getEmailDeps();
    const branding = await deps.getBranding();
    const { subject, html } = await renderTemplate(template, vars, locale, branding, {
      templatesDir: deps.templatesDir,
      getTemplateOverride: deps.getTemplateOverride,
    });
    await sendEmail(valid, subject, html);
  }
}

/**
 * Enqueue a raw HTML email (e.g. form submission notifications).
 * No template rendering — HTML is pre-built by the caller.
 */
export async function enqueueEmail(payload: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!isValidEmail(payload.to)) {
    logger.warn('Invalid recipient, skipping enqueue', { to: payload.to });
    return;
  }

  if (emailQueue) {
    await emailQueue.add('send-raw', payload satisfies RawEmailJob, {
      attempts: 6,
      backoff: { type: 'exponential', delay: 5 * 60_000 },
    });
  } else {
    logger.info(`Sending directly (no Redis): ${payload.subject} -> ${payload.to}`);
    await sendEmail(payload.to, payload.subject, payload.html);
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

/**
 * Initialize email worker with rate limiting.
 * Concurrency: 5, Rate: 5 per minute (300/hour SMTP limit).
 */
export function startEmailWorker(): void {
  const worker = createWorker(
    'email',
    async (job) => {
      if (job.name === 'send-raw') {
        const raw = job.data as RawEmailJob;
        await sendEmail(raw.to, raw.subject, raw.html);
        logger.info('Raw email sent', { to: raw.to, subject: raw.subject });
        return;
      }

      // Template email
      const { to, template, data, locale } = job.data as EmailJob;
      const deps = getEmailDeps();
      const branding = await deps.getBranding();
      const { subject, html } = await renderTemplate(template, data, locale, branding, {
        templatesDir: deps.templatesDir,
        getTemplateOverride: deps.getTemplateOverride,
      });

      const recipients = to.includes(',') ? to.split(',').map((e) => e.trim()) : to;
      await sendEmail(recipients, subject, html);

      logger.info('Email sent', {
        template,
        recipientCount: Array.isArray(recipients) ? recipients.length : 1,
      });
    },
    5,
    { limiter: { max: 5, duration: 60_000 } },
  );

  if (worker) {
    logger.info('Email worker started (concurrency: 5, rate: 5/min)');
  }
}

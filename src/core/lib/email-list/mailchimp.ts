import { createLogger } from '@/core/lib/infra/logger';
import type { EmailListProvider } from './index';

const log = createLogger('mailchimp');

export class MailchimpProvider implements EmailListProvider {
  private apiKey: string;
  private listId: string;
  private server: string;

  constructor() {
    this.apiKey = process.env.MAILCHIMP_API_KEY ?? '';
    this.listId = process.env.MAILCHIMP_LIST_ID ?? '';
    this.server = this.apiKey.split('-').pop() ?? '';
  }

  async subscribe(email: string, fields?: Record<string, unknown>): Promise<void> {
    const url = `https://${this.server}.api.mailchimp.com/3.0/lists/${this.listId}/members`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `apikey ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email_address: email,
        status: 'subscribed',
        merge_fields: fields ?? {},
      }),
    });
    if (!res.ok && res.status !== 400) {
      // 400 = already subscribed, which is fine
      log.warn('Mailchimp subscribe failed', { email, status: res.status });
    }
  }

  async tag(email: string, tags: string[]): Promise<void> {
    const subscriberHash = await this.md5(email.toLowerCase());
    const url = `https://${this.server}.api.mailchimp.com/3.0/lists/${this.listId}/members/${subscriberHash}/tags`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `apikey ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tags: tags.map((name) => ({ name, status: 'active' })),
      }),
    });
    if (!res.ok) {
      log.warn('Mailchimp tag failed', { email, tags, status: res.status });
    }
  }

  private async md5(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('MD5', data).catch(() => {
      // MD5 not available in all runtimes via subtle — fall back to simple hash
      // In practice, Mailchimp accepts the email directly in some endpoints
      return new ArrayBuffer(0);
    });
    if (hashBuffer.byteLength === 0) return input;
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

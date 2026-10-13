import { type EmailListProvider, EmailListProviderError } from './index';

export class MailchimpProvider implements EmailListProvider {
  private apiKey: string;
  private listId: string;
  private server: string;

  constructor() {
    this.apiKey = process.env.MAILCHIMP_API_KEY ?? '';
    this.listId = process.env.MAILCHIMP_LIST_ID ?? '';
    this.server = this.apiKey.split('-').pop() ?? '';
  }

  async subscribe(
    email: string,
    fields?: Record<string, unknown>
  ): Promise<void> {
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
    // 400 = already subscribed, which is fine. Anything else throws so the
    // queue retries; the worker logs with a hashed address.
    if (!res.ok && res.status !== 400) {
      throw new EmailListProviderError(
        `Mailchimp subscribe failed: HTTP ${res.status}`,
        res.status
      );
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
      throw new EmailListProviderError(
        `Mailchimp tag failed: HTTP ${res.status}`,
        res.status
      );
    }
  }

  private async md5(input: string): Promise<string> {
    // Mailchimp keys members by the MD5 of the lower-cased address. WebCrypto
    // has no MD5, so this goes through node:crypto (available in Bun and Node).
    const { createHash } = await import('node:crypto');
    return createHash('md5').update(input).digest('hex');
  }
}

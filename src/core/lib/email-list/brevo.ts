import { createLogger } from '@/core/lib/logger';
import type { EmailListProvider } from './index';

const log = createLogger('brevo');

export class BrevoProvider implements EmailListProvider {
  private apiKey: string;
  private listId: number;

  constructor() {
    this.apiKey = process.env.BREVO_API_KEY ?? '';
    this.listId = parseInt(process.env.BREVO_LIST_ID ?? '0', 10);
  }

  async subscribe(email: string, fields?: Record<string, unknown>): Promise<void> {
    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        listIds: [this.listId],
        attributes: fields ?? {},
        updateEnabled: true,
      }),
    });
    if (!res.ok) {
      log.warn('Brevo subscribe failed', { email, status: res.status });
    }
  }

  async tag(_email: string, _tags: string[]): Promise<void> {
    // Brevo uses lists, not tags — tagging is a no-op for now
    // Could be extended to create/assign lists per tag
    log.warn('Brevo tag not implemented — use lists instead');
  }
}

import { describe, expect, it } from 'vitest';

import {
  addDisposableDomains,
  disposableDomainCount,
  isDisposableEmail,
} from '@/core/lib/auth/disposable-email';

describe('isDisposableEmail', () => {
  it('ships a sizeable blocklist', () => {
    expect(disposableDomainCount()).toBeGreaterThan(5000);
  });

  it('matches a known disposable domain, case-insensitively', () => {
    expect(isDisposableEmail('bob@mailinator.com')).toBe(true);
    expect(isDisposableEmail('Bob@MAILINATOR.COM')).toBe(true);
    expect(isDisposableEmail('x@guerrillamail.com')).toBe(true);
  });

  it('matches any subdomain of a listed domain', () => {
    expect(isDisposableEmail('bob@foo.mailinator.com')).toBe(true);
    expect(isDisposableEmail('bob@a.b.c.mailinator.com')).toBe(true);
  });

  it('does not match an unlisted domain or a lookalike', () => {
    expect(isDisposableEmail('bob@gmail.com')).toBe(false);
    expect(isDisposableEmail('bob@example.org')).toBe(false);
    // Listed domain as a prefix label, not a parent — not a match.
    expect(isDisposableEmail('bob@mailinator.com.example.org')).toBe(false);
    // `.example`/`.test` are reserved TLDs — never on the list.
    expect(isDisposableEmail('bob@mailinator.example')).toBe(false);
    expect(isDisposableEmail('bob@xmailinator.test')).toBe(false);
  });

  it('is false for malformed input instead of throwing', () => {
    expect(isDisposableEmail('')).toBe(false);
    expect(isDisposableEmail('no-at-sign')).toBe(false);
    expect(isDisposableEmail('trailing@')).toBe(false);
    expect(isDisposableEmail('@mailinator.com')).toBe(true);
    expect(isDisposableEmail(undefined)).toBe(false);
    expect(isDisposableEmail(null)).toBe(false);
    expect(isDisposableEmail(42)).toBe(false);
  });

  it('ignores whitespace and a trailing dot in the domain', () => {
    expect(isDisposableEmail('bob@mailinator.com.')).toBe(true);
    expect(isDisposableEmail('bob@ mailinator.com ')).toBe(true);
  });

  it('addDisposableDomains extends the list (and its subdomains)', () => {
    expect(isDisposableEmail('x@corp-throwaway.test')).toBe(false);
    const before = disposableDomainCount();
    addDisposableDomains([' Corp-Throwaway.TEST. ', '', '  ']);
    expect(disposableDomainCount()).toBe(before + 1);
    expect(isDisposableEmail('x@corp-throwaway.test')).toBe(true);
    expect(isDisposableEmail('x@mail.corp-throwaway.test')).toBe(true);
  });
});

import {
  defaultDatabaseUrlFor,
  deriveDbName,
  isPlaceholderDatabaseUrl,
  readExampleDatabaseUrl,
  withDbName,
} from '../init-db-url';
import { describe, expect, it } from 'vitest';

const SHIPPED = 'postgresql://postgres:postgres@localhost:5433/indigo';

describe('readExampleDatabaseUrl', () => {
  it('extracts the DATABASE_URL line from .env.example content', () => {
    const content = `# comment\nDATABASE_URL=${SHIPPED}\nBETTER_AUTH_SECRET=x\n`;
    expect(readExampleDatabaseUrl(content)).toBe(SHIPPED);
  });

  it('returns null for missing file, missing key or blank value', () => {
    expect(readExampleDatabaseUrl(null)).toBeNull();
    expect(readExampleDatabaseUrl('FOO=bar')).toBeNull();
    expect(readExampleDatabaseUrl('DATABASE_URL=\n')).toBeNull();
  });
});

describe('isPlaceholderDatabaseUrl', () => {
  it('treats missing or blank as unconfigured', () => {
    expect(isPlaceholderDatabaseUrl(undefined)).toBe(true);
    expect(isPlaceholderDatabaseUrl('')).toBe(true);
    expect(isPlaceholderDatabaseUrl('   ')).toBe(true);
  });

  it('matches the value currently shipped in .env.example', () => {
    expect(isPlaceholderDatabaseUrl(SHIPPED, SHIPPED)).toBe(true);
    const custom = 'postgresql://x:y@db.internal:5432/indigo_example';
    expect(isPlaceholderDatabaseUrl(custom, custom)).toBe(true);
  });

  it('falls back to the known historical placeholders', () => {
    expect(
      isPlaceholderDatabaseUrl('postgresql://postgres:@localhost:5432/indigo')
    ).toBe(true);
    expect(isPlaceholderDatabaseUrl(SHIPPED)).toBe(true);
  });

  it('matches a verbatim local copy: postgres@localhost, any port/password, db indigo', () => {
    expect(
      isPlaceholderDatabaseUrl(
        'postgresql://postgres:secret@localhost:5999/indigo'
      )
    ).toBe(true);
    expect(
      isPlaceholderDatabaseUrl('postgres://postgres@localhost/indigo')
    ).toBe(true);
  });

  it('leaves an explicitly configured URL alone', () => {
    // Different database name
    expect(
      isPlaceholderDatabaseUrl(
        'postgresql://postgres:postgres@localhost:5433/my_app'
      )
    ).toBe(false);
    // Different user (docker-compose.prod default)
    expect(
      isPlaceholderDatabaseUrl('postgresql://indigo:pw@postgres:5432/indigo')
    ).toBe(false);
    // Different host
    expect(
      isPlaceholderDatabaseUrl('postgresql://postgres:pw@127.0.0.1:5432/indigo')
    ).toBe(false);
    expect(
      isPlaceholderDatabaseUrl('postgresql://postgres:pw@db.example.com/indigo')
    ).toBe(false);
    // Not a URL at all — do not touch it, let the connection step complain
    expect(isPlaceholderDatabaseUrl('not a url')).toBe(false);
  });
});

describe('deriveDbName', () => {
  it('snake_cases the folder name as documented (my-app → my_app)', () => {
    expect(deriveDbName('my-app')).toBe('my_app');
    expect(deriveDbName('My Cool.App')).toBe('my_cool_app');
    expect(deriveDbName('--weird--')).toBe('weird');
  });

  it('prefixes names that cannot start a Postgres identifier', () => {
    expect(deriveDbName('2fast')).toBe('app_2fast');
  });

  it('falls back to indigo for an empty result and caps length', () => {
    expect(deriveDbName('')).toBe('indigo');
    expect(deriveDbName('!!!')).toBe('indigo');
    expect(deriveDbName('a'.repeat(80))).toHaveLength(48);
  });
});

describe('withDbName / defaultDatabaseUrlFor', () => {
  it('swaps only the database name, keeping credentials, host and port', () => {
    expect(withDbName(SHIPPED, 'my_app')).toBe(
      'postgresql://postgres:postgres@localhost:5433/my_app'
    );
  });

  it('derives the default from the shipped example URL', () => {
    expect(defaultDatabaseUrlFor('my-app', SHIPPED)).toEqual({
      url: 'postgresql://postgres:postgres@localhost:5433/my_app',
      dbName: 'my_app',
    });
  });

  it('uses the newest known placeholder when .env.example is unreadable', () => {
    expect(defaultDatabaseUrlFor('my-app', null).url).toBe(
      'postgresql://postgres:postgres@localhost:5433/my_app'
    );
  });
});

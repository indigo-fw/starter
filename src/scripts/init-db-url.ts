/**
 * Pure helpers behind `bun run init`'s DATABASE_URL step — split out of
 * init.ts (which runs `main()` on import) so they can be unit-tested.
 *
 * Why: the starter ships `.env.example` with a shared placeholder URL. A
 * customer who leaves it alone must NOT end up on a database literally named
 * "indigo" — on a dev box that is the framework's own DB, and two projects on
 * one machine would collide. So init derives the name from the project folder.
 */

/** Placeholders that have shipped in `.env.example` over time. */
export const KNOWN_PLACEHOLDER_URLS: readonly string[] = [
  'postgresql://postgres:@localhost:5432/indigo',
  'postgresql://postgres:postgres@localhost:5433/indigo',
];

/** `DATABASE_URL=` value from `.env.example` content, or null when absent. */
export function readExampleDatabaseUrl(
  exampleContent: string | null | undefined
): string | null {
  if (!exampleContent) return null;
  const match = /^DATABASE_URL=(.*)$/m.exec(exampleContent);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

/**
 * True when DATABASE_URL was never configured by the user:
 *   - missing/blank, or
 *   - equal to the current `.env.example` value or any historical placeholder, or
 *   - a verbatim-copied local default: `postgres` user on `localhost`
 *     (any port, any password) pointing at the database `indigo`.
 * Anything else — another host, user or database name — is an explicit choice
 * and is left untouched (e.g. docker-compose.prod's `indigo@postgres/indigo`).
 */
export function isPlaceholderDatabaseUrl(
  url: string | null | undefined,
  exampleUrl: string | null = null
): boolean {
  const value = url?.trim();
  if (!value) return true;
  if (exampleUrl && value === exampleUrl.trim()) return true;
  if (KNOWN_PLACEHOLDER_URLS.includes(value)) return true;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    (parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:') &&
    parsed.hostname === 'localhost' &&
    parsed.username === 'postgres' &&
    parsed.pathname === '/indigo'
  );
}

/** Project folder name → Postgres identifier (`my-app` → `my_app`). */
export function deriveDbName(folderName: string): string {
  const dirName = folderName
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  if (!dirName) return 'indigo';
  return /^[a-z_]/.test(dirName) ? dirName : `app_${dirName}`;
}

/**
 * Placeholder URL with only the database name swapped — credentials, host and
 * port stay what `.env.example` (and thus `docker compose`) expect.
 */
export function withDbName(baseUrl: string, dbName: string): string {
  try {
    const parsed = new URL(baseUrl);
    parsed.pathname = `/${dbName}`;
    return parsed.toString();
  } catch {
    return `postgresql://postgres:postgres@localhost:5433/${dbName}`;
  }
}

/**
 * The URL init should propose for an unconfigured project: the shipped
 * placeholder (current `.env.example` first, else the newest known one)
 * re-pointed at the folder-derived database.
 */
export function defaultDatabaseUrlFor(
  folderName: string,
  exampleUrl: string | null = null
): { url: string; dbName: string } {
  const dbName = deriveDbName(folderName);
  const base =
    exampleUrl?.trim() ||
    KNOWN_PLACEHOLDER_URLS[KNOWN_PLACEHOLDER_URLS.length - 1]!;
  return { url: withDbName(base, dbName), dbName };
}

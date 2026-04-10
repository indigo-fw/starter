import { NextResponse } from 'next/server';
import { validateApiKey, checkRateLimit, apiHeaders } from './api-auth';

/**
 * Wraps an API v1 route handler with auth validation, rate limiting, and error handling.
 * Eliminates boilerplate duplicated across all v1 routes.
 *
 * `checkRateLimit` and `validateApiKey` both return Promise<boolean>.
 * The handler receives the parsed URL and returns any value, which is
 * JSON-serialised with standard `apiHeaders()`.
 */
export async function withApiRoute(
  request: Request,
  handler: (url: URL) => Promise<unknown | Response>,
): Promise<Response> {
  if (!(await validateApiKey(request))) {
    return NextResponse.json(
      { error: 'Invalid or missing API key' },
      { status: 401, headers: apiHeaders() },
    );
  }

  if (!(await checkRateLimit(request))) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: apiHeaders() },
    );
  }

  try {
    const url = new URL(request.url);
    const result = await handler(url);
    // If the handler already returned a Response (e.g. a 404), pass it through
    // directly rather than double-serialising it.
    if (result instanceof Response) return result;
    return NextResponse.json(result, { headers: apiHeaders() });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: apiHeaders() },
    );
  }
}

/**
 * Parses `page` and `pageSize` from URL search params with safe bounds.
 * `page` is clamped to >= 1. `pageSize` is clamped to [1, 100].
 */
export function parseApiPagination(
  url: URL,
  defaultPageSize = 20,
): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('pageSize') ?? String(defaultPageSize), 10)),
  );
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/**
 * Standard paginated API response shape. Matches the `{ data, meta }` envelope
 * used by all v1 list endpoints.
 */
export function paginatedApiResponse<T>(
  data: T[],
  meta: { total: number; page: number; pageSize: number },
) {
  return {
    data,
    meta: {
      ...meta,
      totalPages: Math.ceil(meta.total / meta.pageSize),
    },
  };
}

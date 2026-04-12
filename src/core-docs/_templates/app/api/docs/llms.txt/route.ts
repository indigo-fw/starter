import { NextResponse, type NextRequest } from 'next/server';
import { generateLlmExport } from '@/core-docs/lib/docs-service';
import { DEFAULT_LOCALE, LOCALES } from '@/lib/constants';

/**
 * GET /api/docs/llms.txt?lang=en
 * Returns all documentation as a single plain-text markdown file.
 * Designed for LLMs and AI agents to consume.
 * Defaults to the default locale if no `lang` query param is provided.
 */
export async function GET(request: NextRequest) {
  const langParam = request.nextUrl.searchParams.get('lang') ?? DEFAULT_LOCALE;
  const locale = (LOCALES as readonly string[]).includes(langParam) ? langParam : DEFAULT_LOCALE;

  const content = await generateLlmExport(locale);

  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

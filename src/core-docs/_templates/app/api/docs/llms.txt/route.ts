import { NextResponse } from 'next/server';
import { generateLlmExport } from '@/core-docs/lib/docs-service';

/**
 * GET /api/docs/llms.txt
 * Returns all documentation as a single plain-text markdown file.
 * Designed for LLMs and AI agents to consume.
 */
export async function GET() {
  const content = await generateLlmExport();

  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

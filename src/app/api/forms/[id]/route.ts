import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/server/db';
import { cmsForms } from '@/server/db/schema';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/forms/[id] — return an active form definition by ID or slug.
 * Used by the public ContactForm component to fetch field config.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Try matching by UUID first, then by slug
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id
      );

    const condition = isUuid
      ? and(eq(cmsForms.id, id), eq(cmsForms.active, true))
      : and(eq(cmsForms.slug, id), eq(cmsForms.active, true));

    const [form] = await db
      .select({
        id: cmsForms.id,
        name: cmsForms.name,
        slug: cmsForms.slug,
        fields: cmsForms.fields,
        successMessage: cmsForms.successMessage,
        honeypotField: cmsForms.honeypotField,
      })
      .from(cmsForms)
      .where(condition)
      .limit(1);

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    return NextResponse.json(form);
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { and, count as drizzleCount, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { saasProjects } from '@/server/db/schema/projects';
import { withApiV2Route } from '@/core-api/lib/api-v2-route';
import { parseApiPagination, paginatedApiResponse } from '@/core/lib/api/api-route';

/** GET /api/v2/projects — list projects for the authenticated org. */
export async function GET(request: Request) {
  return withApiV2Route(request, { scope: 'read:projects' }, async (ctx) => {
    const { page, pageSize, offset } = parseApiPagination(ctx.url);
    const status = ctx.url.searchParams.get('status') ?? undefined;

    const conditions = [
      eq(saasProjects.organizationId, ctx.organizationId),
      isNull(saasProjects.deletedAt),
    ];
    if (status) conditions.push(eq(saasProjects.status, status));

    const where = and(...conditions);

    const [projects, countResult] = await Promise.all([
      db
        .select({
          id: saasProjects.id,
          name: saasProjects.name,
          description: saasProjects.description,
          status: saasProjects.status,
          createdAt: saasProjects.createdAt,
          updatedAt: saasProjects.updatedAt,
        })
        .from(saasProjects)
        .where(where)
        .orderBy(desc(saasProjects.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: drizzleCount() }).from(saasProjects).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return paginatedApiResponse(projects, { total, page, pageSize });
  });
}

/** POST /api/v2/projects — create a project for the authenticated org. */
export async function POST(request: Request) {
  return withApiV2Route(request, { scope: 'write:projects' }, async (ctx) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const schema = z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(5000).optional(),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    const [created] = await db
      .insert(saasProjects)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
      })
      .returning({
        id: saasProjects.id,
        name: saasProjects.name,
        description: saasProjects.description,
        status: saasProjects.status,
        createdAt: saasProjects.createdAt,
      });

    return NextResponse.json({ data: created }, { status: 201 });
  });
}

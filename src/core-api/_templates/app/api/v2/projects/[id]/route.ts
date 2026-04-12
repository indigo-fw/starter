import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { saasProjects } from '@/server/db/schema/projects';
import { withApiV2Route } from '@/core-api/lib/api-v2-route';

/** GET /api/v2/projects/:id — get a single project (org-scoped). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiV2Route(request, { scope: 'read:projects' }, async (ctx) => {
    const { id } = await params;

    const [project] = await db
      .select({
        id: saasProjects.id,
        name: saasProjects.name,
        description: saasProjects.description,
        status: saasProjects.status,
        createdAt: saasProjects.createdAt,
        updatedAt: saasProjects.updatedAt,
      })
      .from(saasProjects)
      .where(
        and(
          eq(saasProjects.id, id),
          eq(saasProjects.organizationId, ctx.organizationId),
          isNull(saasProjects.deletedAt),
        ),
      )
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return { data: project };
  });
}

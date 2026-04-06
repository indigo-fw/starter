import { asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/server/db';
import { cmsMenuItems, cmsMenus } from '@/server/db/schema';
import { withApiRoute } from '@/core/lib/api-route';
import { apiHeaders } from '@/core/lib/api-auth';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

interface MenuItemTree {
  id: string;
  parentId: string | null;
  label: string;
  url: string | null;
  contentType: string | null;
  contentId: string | null;
  openInNewTab: boolean;
  order: number;
  children: MenuItemTree[];
}

function buildTree(
  items: Omit<MenuItemTree, 'children'>[],
  parentId: string | null = null
): MenuItemTree[] {
  return items
    .filter((item) => item.parentId === parentId)
    .map((item) => ({
      ...item,
      children: buildTree(items, item.id),
    }));
}

export async function GET(request: Request, { params }: RouteParams) {
  return withApiRoute(request, async (_url) => {
    const { slug } = await params;

    const [menu] = await db
      .select({
        id: cmsMenus.id,
        name: cmsMenus.name,
        slug: cmsMenus.slug,
      })
      .from(cmsMenus)
      .where(eq(cmsMenus.slug, slug))
      .limit(1);

    if (!menu) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: apiHeaders() },
      );
    }

    const items = await db
      .select({
        id: cmsMenuItems.id,
        parentId: cmsMenuItems.parentId,
        label: cmsMenuItems.label,
        url: cmsMenuItems.url,
        contentType: cmsMenuItems.contentType,
        contentId: cmsMenuItems.contentId,
        openInNewTab: cmsMenuItems.openInNewTab,
        order: cmsMenuItems.order,
      })
      .from(cmsMenuItems)
      .where(eq(cmsMenuItems.menuId, menu.id))
      .orderBy(asc(cmsMenuItems.order));

    return {
      data: {
        ...menu,
        items: buildTree(items),
      },
    };
  });
}

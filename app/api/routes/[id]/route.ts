import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logServerEvent, toErrorMessage } from "@/lib/server/logger";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await db.route.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {});
    const route = await db.route.findUnique({
      where: { id },
      include: {
        park: true,
        waypoints: true,
        reviews: { include: { user: { select: { name: true, image: true } } }, orderBy: { createdAt: "desc" } },
        photos: { include: { user: { select: { name: true } } } },
        createdBy: { select: { name: true, image: true } },
      },
    });
    if (!route) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(route);
  } catch (error) {
    logServerEvent("error", "routes.get_failed", {
      routeId: id,
      error: toErrorMessage(error),
    });
    return NextResponse.json({ error: "Failed to fetch route" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const route = await db.route.findUnique({ where: { id }, select: { createdById: true } });
    if (!route) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (route.createdById !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await db.route.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logServerEvent("error", "routes.delete_failed", {
      routeId: id,
      userId: session.user.id,
      error: toErrorMessage(error),
    });
    return NextResponse.json({ error: "Failed to delete route" }, { status: 500 });
  }
}

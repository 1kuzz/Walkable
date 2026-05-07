import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
  } catch {
    return NextResponse.json({ error: "Failed to fetch route" }, { status: 500 });
  }
}

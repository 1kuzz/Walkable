import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logServerEvent, toErrorMessage } from "@/lib/server/logger";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parkId = searchParams.get("parkId");
  const sort = searchParams.get("sort") ?? "popular";

  const orderBy =
    sort === "new" ? { createdAt: "desc" as const } :
    sort === "short" ? { lengthKm: "asc" as const } :
    { viewCount: "desc" as const };

  try {
    const routes = await db.route.findMany({
      where: parkId ? { parkId } : {},
      orderBy,
      include: {
        park: { select: { name: true } },
        _count: { select: { reviews: true } },
      },
      take: 50,
    });
    return NextResponse.json(routes, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    logServerEvent("error", "routes.list_failed", {
      parkId,
      sort,
      error: toErrorMessage(error),
    });
    return NextResponse.json({ error: "Failed to fetch routes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const route = await db.route.create({
      data: {
        ...body,
        createdById: session.user.id,
      },
    });
    return NextResponse.json(route, { status: 201 });
  } catch (error) {
    logServerEvent("error", "routes.create_failed", {
      userId: session.user.id,
      error: toErrorMessage(error),
    });
    return NextResponse.json({ error: "Failed to create route" }, { status: 500 });
  }
}

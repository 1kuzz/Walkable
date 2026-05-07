import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "55.7558");
  const lng = parseFloat(searchParams.get("lng") ?? "37.6173");
  const radius = parseFloat(searchParams.get("radius") ?? "10");
  const type = searchParams.get("type");

  try {
    const parks = await db.park.findMany({
      where: {
        ...(type ? { type: type as any } : {}),
        lat: { gte: lat - radius / 111, lte: lat + radius / 111 },
        lng: { gte: lng - radius / (111 * Math.cos(lat * Math.PI / 180)), lte: lng + radius / (111 * Math.cos(lat * Math.PI / 180)) },
      },
      include: { _count: { select: { routes: true } } },
      take: 50,
    });
    return NextResponse.json(parks);
  } catch {
    return NextResponse.json({ error: "Failed to fetch parks" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { ParkType } from "@prisma/client";
import { db } from "@/lib/db";

const KM_PER_DEGREE_LATITUDE = 111;

const parkTypes = new Set<ParkType>(["urban", "forest", "waterfront", "national"]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "55.7558");
  const lng = parseFloat(searchParams.get("lng") ?? "37.6173");
  const radius = parseFloat(searchParams.get("radius") ?? "10");
  const type = searchParams.get("type");
  const parsedType = type && parkTypes.has(type as ParkType) ? (type as ParkType) : undefined;

  try {
    const parks = await db.park.findMany({
      where: {
        ...(parsedType ? { type: parsedType } : {}),
        lat: { gte: lat - radius / KM_PER_DEGREE_LATITUDE, lte: lat + radius / KM_PER_DEGREE_LATITUDE },
        lng: { gte: lng - radius / (KM_PER_DEGREE_LATITUDE * Math.cos(lat * Math.PI / 180)), lte: lng + radius / (KM_PER_DEGREE_LATITUDE * Math.cos(lat * Math.PI / 180)) },
      },
      include: { _count: { select: { routes: true } } },
      take: 50,
    });
    return NextResponse.json(parks);
  } catch {
    return NextResponse.json({ error: "Failed to fetch parks" }, { status: 500 });
  }
}


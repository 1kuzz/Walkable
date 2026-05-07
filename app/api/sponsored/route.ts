import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const KM_PER_DEGREE_LATITUDE = 111;
const DEG_TO_RAD = Math.PI / 180;
const MAX_SPONSORED_STOPS = 20;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "55.7558");
  const lng = parseFloat(searchParams.get("lng") ?? "37.6173");
  const radius = parseFloat(searchParams.get("radius") ?? "3");
  const routeId = searchParams.get("routeId") ?? undefined;

  try {
    const longitudeRadius = radius / (KM_PER_DEGREE_LATITUDE * Math.cos(lat * DEG_TO_RAD));

    const sponsoredStops = await db.sponsoredStop.findMany({
      where: {
        ...(routeId ? { routeId } : {}),
        meal: {
          isActive: true,
          lat: { gte: lat - radius / KM_PER_DEGREE_LATITUDE, lte: lat + radius / KM_PER_DEGREE_LATITUDE },
          lng: { gte: lng - longitudeRadius, lte: lng + longitudeRadius },
        },
      },
      include: {
        meal: true,
      },
      orderBy: { stopOrder: "asc" },
      take: MAX_SPONSORED_STOPS,
    });

    return NextResponse.json(sponsoredStops.map((stop) => ({
      id: stop.id,
      routeId: stop.routeId,
      name: stop.meal.name,
      description: stop.meal.description,
      lat: stop.meal.lat,
      lng: stop.meal.lng,
      logoUrl: stop.meal.logoUrl,
      partnerUrl: stop.meal.partnerUrl,
    })));
  } catch {
    return NextResponse.json({ error: "Failed to fetch sponsored meals" }, { status: 500 });
  }
}

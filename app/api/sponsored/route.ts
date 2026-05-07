import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "55.7558");
  const lng = parseFloat(searchParams.get("lng") ?? "37.6173");
  const radius = parseFloat(searchParams.get("radius") ?? "3");
  const routeId = searchParams.get("routeId") ?? undefined;

  try {
    const sponsoredStops = await db.sponsoredStop.findMany({
      where: {
        ...(routeId ? { routeId } : {}),
        meal: {
          isActive: true,
          lat: { gte: lat - radius / 111, lte: lat + radius / 111 },
          lng: { gte: lng - radius / (111 * Math.cos(lat * Math.PI / 180)), lte: lng + radius / (111 * Math.cos(lat * Math.PI / 180)) },
        },
      },
      include: {
        meal: true,
      },
      orderBy: { stopOrder: "asc" },
      take: 20,
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

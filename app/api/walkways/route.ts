import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logServerEvent, toErrorMessage } from "@/lib/server/logger";

const WALKWAY_TYPES = ["footway", "path", "cycleway", "pedestrian", "steps", "track", "bridleway"] as const;

function parseBbox(value: string | null) {
  if (!value) {
    return null;
  }

  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }

  const [south, west, north, east] = parts;
  if (south > north) {
    return undefined;
  }

  return { south, west, north, east };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parkId = searchParams.get("parkId");
  const type = searchParams.get("type");
  const bbox = parseBbox(searchParams.get("bbox"));

  if (searchParams.get("bbox") && !bbox) {
    return NextResponse.json({ error: "Invalid bbox. Expected south,west,north,east." }, { status: 400 });
  }

  if (type && !WALKWAY_TYPES.includes(type as (typeof WALKWAY_TYPES)[number])) {
    return NextResponse.json({ error: "Invalid walkway type." }, { status: 400 });
  }

  try {
    const bboxWhere = bbox
      ? bbox.west <= bbox.east
        ? {
            lat: { gte: bbox.south, lte: bbox.north },
            lng: { gte: bbox.west, lte: bbox.east },
          }
        : {
            AND: [
              { lat: { gte: bbox.south, lte: bbox.north } },
              {
                OR: [
                  { lng: { gte: bbox.west } },
                  { lng: { lte: bbox.east } },
                ],
              },
            ],
          }
      : undefined;
    const walkways = await db.walkway.findMany({
      where: {
        ...(parkId ? { parkId } : {}),
        ...(type ? { type: type as (typeof WALKWAY_TYPES)[number] } : {}),
        ...(bboxWhere ?? {}),
      },
      select: {
        id: true,
        osmId: true,
        name: true,
        type: true,
        geometryGeoJson: true,
      },
      // Keep the payload bounded for map rendering and client-side parsing.
      orderBy: [
        { parkId: "asc" },
        { name: "asc" },
        { createdAt: "desc" },
      ],
      take: 2000,
    });

    return NextResponse.json(walkways, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    logServerEvent("error", "walkways.list_failed", {
      parkId,
      type,
      bbox: searchParams.get("bbox"),
      error: toErrorMessage(error),
    });
    return NextResponse.json({ error: "Failed to fetch walkways" }, { status: 500 });
  }
}

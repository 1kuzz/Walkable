import { ParkType, PrismaClient, type WalkwayType } from "@prisma/client";

const db = new PrismaClient();

const BBOX = { south: 55.57, west: 37.37, north: 55.92, east: 37.85 };

interface OverpassElement {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

const WALKWAY_TYPES = [
  "footway",
  "path",
  "cycleway",
  "pedestrian",
  "steps",
  "track",
  "bridleway",
] as const satisfies WalkwayType[];
const MAX_WALKWAY_PARK_DISTANCE_KM = 2;

async function queryOverpass(query: string): Promise<OverpassResponse> {
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: `data=${encodeURIComponent(query)}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.json() as Promise<OverpassResponse>;
}

async function importParks() {
  console.log("Importing parks from OSM...");
  const query = `
    [out:json][timeout:60];
    (
      node["leisure"="park"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
      way["leisure"="park"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
      relation["boundary"="national_park"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
    );
    out center tags;
  `;

  const data = await queryOverpass(query);
  let count = 0;

  for (const element of data.elements ?? []) {
    const name = element.tags?.name;
    if (!name) continue;

    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (!lat || !lng) continue;

    const osmId = `${element.type}/${element.id}`;
    const parkType: ParkType = element.tags?.boundary === "national_park" ? "national" : "urban";

    await db.park.upsert({
      where: { osmId },
      create: {
        osmId,
        name,
        lat,
        lng,
        type: parkType,
        description: element.tags?.description ?? null,
      },
      update: { name, lat, lng },
    });
    count++;
  }

  console.log(`Imported ${count} parks.`);
}

async function importRoutes() {
  console.log("Importing hiking routes from OSM...");
  const query = `
    [out:json][timeout:60];
    relation["route"="hiking"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
    out center tags;
  `;

  const data = await queryOverpass(query);
  console.log(`Found ${data.elements?.length ?? 0} hiking routes.`);
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function distanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

async function importWalkways() {
  console.log("Importing walkways from OSM...");
  const query = `
    [out:json][timeout:120];
    (
      way["highway"~"^(footway|path|cycleway|pedestrian|steps|track|bridleway)$"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
    );
    out geom tags;
  `;

  const [data, parks] = await Promise.all([
    queryOverpass(query),
    db.park.findMany({
      select: {
        id: true,
        lat: true,
        lng: true,
      },
    }),
  ]);
  let count = 0;

  for (const element of data.elements ?? []) {
    if (element.type !== "way") continue;

    const walkwayType = element.tags?.highway as WalkwayType | undefined;
    if (!walkwayType || !WALKWAY_TYPES.includes(walkwayType)) continue;

    const coordinates = element.geometry?.map((point) => [point.lon, point.lat] as [number, number]) ?? [];
    if (coordinates.length < 2) continue;

    const lat = average(coordinates.map(([, pointLat]) => pointLat));
    const lng = average(coordinates.map(([pointLng]) => pointLng));
    const nearestPark = parks.reduce<{ id: string; distanceKm: number } | null>((closest, park) => {
      const nextDistance = distanceKm({ lat, lng }, park);
      if (!closest || nextDistance < closest.distanceKm) {
        return { id: park.id, distanceKm: nextDistance };
      }
      return closest;
    }, null);
    const parkId = nearestPark && nearestPark.distanceKm <= MAX_WALKWAY_PARK_DISTANCE_KM ? nearestPark.id : null;
    const geometryGeoJson = JSON.stringify({
      type: "LineString",
      coordinates,
    });

    await db.walkway.upsert({
      where: { osmId: `way/${element.id}` },
      create: {
        osmId: `way/${element.id}`,
        parkId,
        name: element.tags?.name ?? null,
        type: walkwayType,
        geometryGeoJson,
        lat,
        lng,
      },
      update: {
        parkId,
        name: element.tags?.name ?? null,
        type: walkwayType,
        geometryGeoJson,
        lat,
        lng,
      },
    });
    count++;
  }

  console.log(`Imported ${count} walkways.`);
}

async function main() {
  try {
    await importParks();
    await importWalkways();
    await importRoutes();
  } finally {
    await db.$disconnect();
  }
}

main().catch(console.error);

import { ParkType, PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const BBOX = { south: 55.57, west: 37.37, north: 55.92, east: 37.85 };

interface OverpassElement {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

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
    const parkType: ParkType = element.tags?.boundary === "national_park" ? ParkType.national : ParkType.urban;

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

async function main() {
  try {
    await importParks();
    await importRoutes();
  } finally {
    await db.$disconnect();
  }
}

main().catch(console.error);

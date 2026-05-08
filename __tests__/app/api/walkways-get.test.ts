import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const findManyWalkwaysMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    walkway: {
      findMany: findManyWalkwaysMock,
    },
  },
}));

vi.mock("@/lib/server/logger", () => ({
  logServerEvent: vi.fn(),
  toErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

describe("GET /api/walkways", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for an invalid bbox filter", async () => {
    const { GET } = await import("@/app/api/walkways/route");

    const response = await GET(new NextRequest("http://localhost:3000/api/walkways?bbox=bad"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid bbox. Expected south,west,north,east." });
    expect(findManyWalkwaysMock).not.toHaveBeenCalled();
  });

  it("returns filtered walkways with cache headers", async () => {
    findManyWalkwaysMock.mockResolvedValueOnce([
      {
        id: "walkway_1",
        osmId: "way/123",
        name: "Connector",
        type: "footway",
        geometryGeoJson: JSON.stringify({
          type: "LineString",
          coordinates: [[37.6, 55.75], [37.61, 55.751]],
        }),
      },
    ]);
    const { GET } = await import("@/app/api/walkways/route");

    const response = await GET(
      new NextRequest("http://localhost:3000/api/walkways?parkId=park_1&type=footway&bbox=55.7,37.5,55.8,37.7"),
    );

    expect(response.status).toBe(200);
    expect(findManyWalkwaysMock).toHaveBeenCalledWith({
      where: {
        parkId: "park_1",
        type: "footway",
        lat: { gte: 55.7, lte: 55.8 },
        lng: { gte: 37.5, lte: 37.7 },
      },
      select: {
        id: true,
        osmId: true,
        name: true,
        type: true,
        geometryGeoJson: true,
      },
      orderBy: [
        { parkId: "asc" },
        { name: "asc" },
        { createdAt: "desc" },
      ],
      take: 2000,
    });
    expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=60, stale-while-revalidate=300");
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        id: "walkway_1",
        osmId: "way/123",
        type: "footway",
      }),
    ]);
  });
});

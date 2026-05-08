import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getServerSessionMock = vi.fn();
const createRouteMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    route: {
      create: createRouteMock,
    },
  },
}));

vi.mock("@/lib/server/logger", () => ({
  logServerEvent: vi.fn(),
  toErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

describe("POST /api/routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/routes/route");

    const req = new NextRequest("http://localhost:3000/api/routes", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(req);
    expect(response.status).toBe(401);
    expect(createRouteMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid payload", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user_1" } });
    const { POST } = await import("@/app/api/routes/route");

    const req = new NextRequest("http://localhost:3000/api/routes", {
      method: "POST",
      body: JSON.stringify({ name: "bad-payload-only" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );
    expect(createRouteMock).not.toHaveBeenCalled();
  });

  it("creates route with sanitized payload when valid", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user_1" } });
    createRouteMock.mockResolvedValueOnce({ id: "route_1" });
    const { POST } = await import("@/app/api/routes/route");

    const req = new NextRequest("http://localhost:3000/api/routes", {
      method: "POST",
      body: JSON.stringify({
        parkId: "park_1",
        name: "My route",
        difficulty: "easy",
        lengthKm: 5,
        elevationGain: 100,
        surfaceType: "mixed",
        estimatedMin: 55,
        geometryGeoJson: JSON.stringify({
          type: "LineString",
          coordinates: [[37.6, 55.75], [37.7, 55.8]],
        }),
        waypoints: {
          create: [
            { lat: 55.75, lng: 37.6, name: "A" },
            { lat: 55.8, lng: 37.7, name: "B" },
          ],
        },
        createdById: "spoofed-user",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(req);

    expect(response.status).toBe(201);
    expect(createRouteMock).toHaveBeenCalledTimes(1);
    expect(createRouteMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parkId: "park_1",
        name: "My route",
        createdById: "user_1",
      }),
    });
    expect(createRouteMock.mock.calls[0][0].data.createdById).not.toBe("spoofed-user");
  });
});

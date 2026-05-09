import { describe, expect, it } from "vitest";
import { validateCreateRoutePayload } from "@/lib/routes/create-route-payload";

const validPayload = {
  parkId: "park_123",
  name: "Morning trail",
  description: "Nice walk",
  difficulty: "easy",
  lengthKm: 4.2,
  elevationGain: 120,
  surfaceType: "mixed",
  estimatedMin: 50,
  geometryGeoJson: JSON.stringify({
    type: "LineString",
    coordinates: [[37.6, 55.75], [37.61, 55.76], [37.62, 55.765]],
  }),
  waypoints: {
    create: [
      { lat: 55.75, lng: 37.6, name: "Start" },
      { lat: 55.765, lng: 37.62, name: "Finish" },
    ],
  },
};

describe("validateCreateRoutePayload", () => {
  it("accepts and sanitizes a valid payload", () => {
    const result = validateCreateRoutePayload(validPayload);

    expect(result.error).toBeUndefined();
    expect(result.data?.parkId).toBe("park_123");
    expect(result.data?.name).toBe("Morning trail");
    expect(result.data?.waypoints.create).toHaveLength(2);
    expect(result.data?.geometryGeoJson).toContain("LineString");
    expect(result.data?.transportMode).toBe("foot");
  });

  it("rejects invalid geometry", () => {
    const result = validateCreateRoutePayload({
      ...validPayload,
      geometryGeoJson: JSON.stringify({ type: "Point", coordinates: [37.6, 55.75] }),
    });

    expect(result.data).toBeUndefined();
    expect(result.error).toContain("LineString");
  });

  it("rejects duplicate waypoints", () => {
    const result = validateCreateRoutePayload({
      ...validPayload,
      waypoints: {
        create: [
          { lat: 55.75, lng: 37.6, name: "A" },
          { lat: 55.75, lng: 37.6, name: "B" },
        ],
      },
    });

    expect(result.data).toBeUndefined();
    expect(result.error).toContain("duplicate");
  });

  it("rejects payloads with fewer than two waypoints", () => {
    const result = validateCreateRoutePayload({
      ...validPayload,
      waypoints: { create: [{ lat: 55.75, lng: 37.6 }] },
    });

    expect(result.data).toBeUndefined();
    expect(result.error).toContain("at least 2");
  });

  it("rejects unsupported transport mode", () => {
    const result = validateCreateRoutePayload({
      ...validPayload,
      transportMode: "bike",
    });

    expect(result.data).toBeUndefined();
    expect(result.error).toContain("transportMode");
  });
});

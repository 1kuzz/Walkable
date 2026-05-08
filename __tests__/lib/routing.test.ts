import { afterEach, describe, expect, it, vi } from "vitest";
import { getRoute } from "@/lib/routing";

describe("getRoute", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when there are fewer than two waypoints", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getRoute([[37.61, 55.75]]);

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a routed path from OSRM response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [{
          distance: 1200,
          duration: 900,
          geometry: {
            coordinates: [[37.61, 55.75], [37.62, 55.76]],
          },
        }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getRoute([[37.61, 55.75], [37.62, 55.76]], "Test route");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      feature: {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [[37.61, 55.75], [37.62, 55.76]],
        },
        properties: {
          id: "rerouted-2",
          name: "Test route",
          color: "#f97316",
          source: "reroute",
        },
      },
      distanceKm: 1.2,
      durationMin: 15,
    });
  });

  it("throws when OSRM request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(getRoute([[37.61, 55.75], [37.62, 55.76]])).rejects.toThrow("Failed to fetch directions");
  });

  it("returns null when OSRM has no usable coordinates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [{ geometry: { coordinates: [] } }],
      }),
    }));

    const result = await getRoute([[37.61, 55.75], [37.62, 55.76]]);

    expect(result).toBeNull();
  });

  it("returns null when OSRM response coordinates are malformed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [{
          geometry: {
            coordinates: [[37.61], ["bad", 55.75], [37.62, "bad"], [37.62, 55.76]],
          },
        }],
      }),
    }));

    const result = await getRoute([[37.61, 55.75], [37.62, 55.76]]);

    expect(result).toBeNull();
  });
});

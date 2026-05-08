import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRouteCache, getRoute, getRoutingFallbackMessage } from "@/lib/routing";

describe("getRoute", () => {
  afterEach(() => {
    clearRouteCache();
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_OSRM_PROFILE;
    delete process.env.NEXT_PUBLIC_ORS_API_KEY;
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
      routing: {
        provider: "osrm",
        profile: "foot",
        preference: "park",
        quality: "fallback",
        fallbackReason: "ors_missing_key",
      },
    });
  });

  it("uses a pedestrian OSRM profile from env", async () => {
    process.env.NEXT_PUBLIC_OSRM_PROFILE = "walking";
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

    await getRoute([[37.61, 55.75], [37.62, 55.76]]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/route/v1/walking/");
  });

  it("ignores non-pedestrian OSRM profiles and falls back to foot", async () => {
    process.env.NEXT_PUBLIC_OSRM_PROFILE = "driving";
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

    await getRoute([[37.61, 55.75], [37.62, 55.76]]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/route/v1/foot/");
  });

  it("defaults to park preference and uses ORS when key is configured", async () => {
    process.env.NEXT_PUBLIC_ORS_API_KEY = "test-ors-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{
          geometry: {
            coordinates: [[37.61, 55.75], [37.62, 55.76]],
          },
          properties: {
            summary: {
              distance: 1200,
              duration: 900,
            },
          },
        }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getRoute([[37.61, 55.75], [37.62, 55.76]]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("openrouteservice.org/v2/directions/foot-walking/geojson");
  });

  it("marks route metadata with ORS provider when park preference uses ORS", async () => {
    process.env.NEXT_PUBLIC_ORS_API_KEY = "test-ors-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{
          geometry: {
            coordinates: [[37.61, 55.75], [37.62, 55.76]],
          },
          properties: {
            summary: {
              distance: 1200,
              duration: 900,
            },
          },
        }],
      }),
    }));

    const result = await getRoute([[37.61, 55.75], [37.62, 55.76]]);

    expect(result?.routing).toEqual({
      provider: "ors",
      profile: "foot-walking",
      preference: "park",
      quality: "preferred",
    });
  });

  it("falls back to OSRM with fallback metadata when ORS returns no geometry", async () => {
    process.env.NEXT_PUBLIC_ORS_API_KEY = "test-ors-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          features: [{
            geometry: {
              coordinates: [],
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
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

    const result = await getRoute([[37.61, 55.75], [37.62, 55.76]]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result?.routing).toMatchObject({
      provider: "osrm",
      quality: "fallback",
      fallbackReason: "ors_no_geometry",
      preference: "park",
    });
  });

  it("falls back to OSRM with fallback metadata when ORS request fails", async () => {
    process.env.NEXT_PUBLIC_ORS_API_KEY = "test-ors-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
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

    const result = await getRoute([[37.61, 55.75], [37.62, 55.76]]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result?.routing).toMatchObject({
      provider: "osrm",
      quality: "fallback",
      fallbackReason: "ors_error",
      preference: "park",
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

  it("reuses cached route geometry for repeated waypoint requests", async () => {
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

    const first = await getRoute([[37.61, 55.75], [37.62, 55.76]], "First name");
    const second = await getRoute([[37.61, 55.75], [37.62, 55.76]], "Second name");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first?.feature.properties.name).toBe("First name");
    expect(second?.feature.properties.name).toBe("Second name");
    expect(second?.feature.geometry.coordinates).toEqual(first?.feature.geometry.coordinates);
  });

  it("promotes a resolved in-flight request into the route cache", async () => {
    let resolveFetch: ((value: {
      ok: boolean;
      json: () => Promise<{
        code: string;
        routes: Array<{
          distance: number;
          duration: number;
          geometry: { coordinates: number[][] };
        }>;
      }>;
    }) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);

    const firstPromise = getRoute([[37.61, 55.75], [37.62, 55.76]], "First");
    const secondPromise = getRoute([[37.61, 55.75], [37.62, 55.76]], "Second");

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch?.({
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

    await firstPromise;
    await secondPromise;
    await getRoute([[37.61, 55.75], [37.62, 55.76]], "Third");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns explicit fallback message for missing park-aware routing configuration", () => {
    const message = getRoutingFallbackMessage({
      provider: "osrm",
      profile: "foot",
      preference: "park",
      quality: "fallback",
      fallbackReason: "ors_missing_key",
    });

    expect(message).toContain("not configured");
  });

  it("returns explicit fallback message when park-aware routing provider errors", () => {
    const message = getRoutingFallbackMessage({
      provider: "osrm",
      profile: "foot",
      preference: "park",
      quality: "fallback",
      fallbackReason: "ors_error",
    });

    expect(message).toContain("temporarily unavailable");
  });

  it("returns explicit fallback message when park geometry is unavailable", () => {
    const message = getRoutingFallbackMessage({
      provider: "osrm",
      profile: "foot",
      preference: "park",
      quality: "fallback",
      fallbackReason: "ors_no_geometry",
    });

    expect(message).toContain("no usable park-path geometry");
  });
});

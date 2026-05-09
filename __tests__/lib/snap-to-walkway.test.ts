import { afterEach, describe, expect, it, vi } from "vitest";
import { isSignificantSnap, snapToNearestRoad, snapToNearestWalkway } from "@/lib/snap-to-walkway";

describe("snap-to-walkway utilities", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_OSRM_BASE_URL;
  });

  it("snaps to nearest walkway when OSRM nearest succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "Ok",
        waypoints: [{ location: [37.612, 55.751] }],
      }),
    }));

    const snapped = await snapToNearestWalkway([37.61, 55.75]);

    expect(snapped).toEqual([37.612, 55.751]);
  });

  it("falls back to original point when nearest lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const original: [number, number] = [37.61, 55.75];
    const snapped = await snapToNearestWalkway(original);

    expect(snapped).toEqual(original);
  });

  it("uses road profile for road snapping", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "Ok",
        waypoints: [{ location: [37.615, 55.755] }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await snapToNearestRoad([37.61, 55.75]);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/nearest/v1/car/");
  });

  it("detects significant snaps over threshold", () => {
    expect(isSignificantSnap([37.61, 55.75], [37.62, 55.76], 50)).toBe(true);
    expect(isSignificantSnap([37.61, 55.75], [37.610001, 55.750001], 50)).toBe(false);
  });
});

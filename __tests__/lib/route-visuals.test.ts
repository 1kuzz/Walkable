import { describe, expect, it } from "vitest";
import { resolveRouteStyle } from "@/lib/map/route-visuals";

describe("resolveRouteStyle", () => {
  it("keeps draft routes dominant in builder mode", () => {
    const style = resolveRouteStyle({
      route: { source: "draft" },
      visualMode: "builder",
      routeColor: "#f97316",
      isActive: false,
      enableRouteSnapping: false,
    });

    expect(style.interactive).toBe(false);
    expect(style.bodyOpacity).toBeGreaterThan(0.9);
    expect(style.bodyWidth).toBeGreaterThan(8);
    expect(style.highlightOpacity).toBe(0);
  });

  it("de-emphasizes community routes in builder mode", () => {
    const style = resolveRouteStyle({
      route: { source: "route" },
      visualMode: "builder",
      routeColor: "#60a5fa",
      isActive: false,
      enableRouteSnapping: false,
    });

    expect(style.interactive).toBe(false);
    expect(style.bodyOpacity).toBeLessThan(0.5);
    expect(style.bodyWidth).toBeLessThan(5);
  });

  it("enables route interactivity only for community routes when snapping is enabled", () => {
    const communityStyle = resolveRouteStyle({
      route: { source: "route" },
      visualMode: "builder",
      routeColor: "#60a5fa",
      isActive: false,
      enableRouteSnapping: true,
    });
    const draftStyle = resolveRouteStyle({
      route: { source: "draft" },
      visualMode: "builder",
      routeColor: "#f97316",
      isActive: false,
      enableRouteSnapping: true,
    });

    expect(communityStyle.interactive).toBe(true);
    expect(draftStyle.interactive).toBe(false);
  });
});

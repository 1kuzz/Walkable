import { describe, expect, it } from "vitest";
import { createHoverPreviewResetKey } from "@/lib/routes/hover-preview";

describe("createHoverPreviewResetKey", () => {
  it("changes when waypoint is added or removed", () => {
    const base = [[37.61, 55.75], [37.62, 55.76]] as [number, number][];
    const withExtra = [...base, [37.63, 55.77]] as [number, number][];
    const afterRemoval = [base[0]] as [number, number][];

    expect(createHoverPreviewResetKey(base, "park")).not.toBe(createHoverPreviewResetKey(withExtra, "park"));
    expect(createHoverPreviewResetKey(base, "park")).not.toBe(createHoverPreviewResetKey(afterRemoval, "park"));
  });

  it("changes when waypoint order changes", () => {
    const ordered = [[37.61, 55.75], [37.62, 55.76], [37.63, 55.77]] as [number, number][];
    const reordered = [[37.63, 55.77], [37.62, 55.76], [37.61, 55.75]] as [number, number][];

    expect(createHoverPreviewResetKey(ordered, "park")).not.toBe(createHoverPreviewResetKey(reordered, "park"));
  });

  it("changes when routing preference changes", () => {
    const waypoints = [[37.61, 55.75], [37.62, 55.76]] as [number, number][];

    expect(createHoverPreviewResetKey(waypoints, "park")).not.toBe(createHoverPreviewResetKey(waypoints, "foot"));
  });
});

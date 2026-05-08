import { describe, expect, it } from "vitest";
import { parseWalkwayGeometry } from "@/lib/geo";

describe("parseWalkwayGeometry", () => {
  it("parses valid linestring geometry into a walkway feature", () => {
    const feature = parseWalkwayGeometry(
      JSON.stringify({
        type: "LineString",
        coordinates: [[37.6, 55.75], [37.61, 55.751]],
      }),
      {
        id: "walkway_1",
        osmId: "way/123",
        name: "Park connector",
        type: "footway",
      },
    );

    expect(feature).toMatchObject({
      geometry: {
        type: "LineString",
        coordinates: [[37.6, 55.75], [37.61, 55.751]],
      },
      properties: {
        id: "walkway_1",
        osmId: "way/123",
        name: "Park connector",
        type: "footway",
      },
    });
  });

  it("returns null for non-linestring geometry", () => {
    expect(
      parseWalkwayGeometry(
        JSON.stringify({ type: "Point", coordinates: [37.6, 55.75] }),
        { id: "walkway_1", osmId: "way/123", type: "footway" },
      ),
    ).toBeNull();
  });
});

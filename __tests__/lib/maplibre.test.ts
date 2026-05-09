import { describe, expect, it } from "vitest";
import {
  createVectorStyle,
  createWalkableStyle,
  VECTOR_FOOTPATH_COLOR,
  VECTOR_PARK_COLOR,
  WALKABLE_ROAD_RIVER_COLOR,
  WALKABLE_ROAD_CASING_COLOR,
} from "@/lib/maplibre";

function getWalkablePathsLayer() {
  const walkablePaths = createVectorStyle().layers.find((layer) => layer.id === "walkable-paths");
  expect(walkablePaths).toBeDefined();
  return walkablePaths as NonNullable<typeof walkablePaths>;
}

function getWalkablePathsFilterJson() {
  const walkablePaths = getWalkablePathsLayer();
  expect(walkablePaths).toBeDefined();
  return JSON.stringify((walkablePaths as { filter?: unknown }).filter);
}

describe("createVectorStyle", () => {
  it("contains the walkable paths layer", () => {
    expect(getWalkablePathsLayer().id).toBe("walkable-paths");
  });

  it("renders walkable paths above road layers", () => {
    const layers = createVectorStyle().layers;
    const roadIndex = layers.findIndex((layer) => layer.id === "road-minor");
    const pathsIndex = layers.findIndex((layer) => layer.id === "walkable-paths");

    expect(roadIndex).toBeGreaterThan(-1);
    expect(pathsIndex).toBeGreaterThan(roadIndex);
  });

  it("uses the correct color token for walkable paths", () => {
    const walkablePaths = getWalkablePathsLayer();

    expect((walkablePaths as { paint?: Record<string, unknown> }).paint?.["line-color"]).toBe(VECTOR_FOOTPATH_COLOR);
  });

  it("uses vector park color token for landuse park fill", () => {
    const parkLayer = createVectorStyle().layers.find((layer) => layer.id === "landuse-park");
    expect((parkLayer as { paint?: Record<string, unknown> }).paint?.["fill-color"]).toBe(VECTOR_PARK_COLOR);
  });

  it("includes pathway transport classes and excludes road transport classes in filter", () => {
    const filter = getWalkablePathsFilterJson();

    expect(filter).toContain("\"footway\"");
    expect(filter).toContain("\"path\"");
    expect(filter).toContain("\"cycleway\"");
    expect(filter).toContain("\"motorway\"");
    expect(filter).toContain("\"residential\"");
    expect(filter).toContain("\"living_street\"");
  });

  it("guards against non-path transport classes leaking into the path layer", () => {
    const walkablePaths = getWalkablePathsLayer();
    const filter = getWalkablePathsFilterJson();
    const structuredFilter = (walkablePaths as { filter?: unknown[] }).filter ?? [];
    const hasNegatedNonPathClassExclusion = structuredFilter.some((clause) => (
      Array.isArray(clause)
      && clause[0] === "!"
      && Array.isArray(clause[1])
      && clause[1][0] === "match"
      && Array.isArray(clause[1][2])
      && clause[1][2].includes("rail")
      && clause[1][2].includes("ferry")
    ));

    expect(filter).toContain("\"subclass\"");
    expect(filter).toContain("\"rail\"");
    expect(filter).toContain("\"tram\"");
    expect(filter).toContain("\"ferry\"");
    expect(filter).toContain("\"aerialway\"");
    expect(hasNegatedNonPathClassExclusion).toBe(true);
  });

  it("does not block valid path subclasses by broad road class exclusion", () => {
    const walkablePaths = getWalkablePathsLayer();
    const structuredFilter = (walkablePaths as { filter?: unknown[] }).filter ?? [];
    const hasNegatedRoadClassExclusion = structuredFilter.some((clause) => (
      Array.isArray(clause)
      && clause[0] === "!"
      && Array.isArray(clause[1])
      && clause[1][0] === "match"
      && Array.isArray(clause[1][1])
      && clause[1][1][0] === "get"
      && clause[1][1][1] === "class"
      && Array.isArray(clause[1][2])
      && clause[1][2].includes("motorway")
      && clause[1][2].includes("residential")
    ));

    expect(hasNegatedRoadClassExclusion).toBe(false);
  });
});

describe("createWalkableStyle", () => {
  it("uses the same robust pathway filter as vector mode", () => {
    const walkablePaths = createWalkableStyle().layers.find((layer) => layer.id === "walkable-paths");
    const filter = JSON.stringify((walkablePaths as { filter?: unknown }).filter);

    expect(filter).toContain("\"subclass\"");
    expect(filter).toContain("\"sidewalk\"");
    expect(filter).toContain("\"rail\"");
    expect(filter).toContain("\"ferry\"");
  });

  it("renders all drivable classes as river roads with casing", () => {
    const style = createWalkableStyle();
    const riverMinor = style.layers.find((layer) => layer.id === "road-river-minor");
    const casingMinor = style.layers.find((layer) => layer.id === "road-river-casing-minor");
    const riverMinorFilter = JSON.stringify((riverMinor as { filter?: unknown }).filter);

    expect(riverMinor).toBeDefined();
    expect(casingMinor).toBeDefined();
    expect(riverMinorFilter).toContain("\"residential\"");
    expect(riverMinorFilter).toContain("\"unclassified\"");
    expect(riverMinorFilter).toContain("\"living_street\"");
    expect(riverMinorFilter).toContain("\"tertiary_link\"");

    expect((riverMinor as { paint?: Record<string, unknown> }).paint?.["line-color"]).toBe(WALKABLE_ROAD_RIVER_COLOR);
    expect((casingMinor as { paint?: Record<string, unknown> }).paint?.["line-color"]).toBe(WALKABLE_ROAD_CASING_COLOR);
  });

  it("uses a casing layer and stronger dashed styling for walkable paths", () => {
    const style = createWalkableStyle();
    const casing = style.layers.find((layer) => layer.id === "walkable-paths-casing");
    const paths = style.layers.find((layer) => layer.id === "walkable-paths");

    expect(casing).toBeDefined();
    expect(paths).toBeDefined();
    expect((paths as { paint?: Record<string, unknown> }).paint?.["line-dasharray"]).toEqual([3, 1.5]);
    expect((paths as { paint?: Record<string, unknown> }).paint?.["line-width"]).not.toBe(2);
  });
});

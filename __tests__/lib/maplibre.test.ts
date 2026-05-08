import { describe, expect, it } from "vitest";
import { createVectorStyle, createWalkableStyle, VECTOR_FOOTPATH_COLOR } from "@/lib/maplibre";

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

  it("uses the correct color token for walkable paths", () => {
    const walkablePaths = getWalkablePathsLayer();

    expect((walkablePaths as { paint?: Record<string, unknown> }).paint?.["line-color"]).toBe(VECTOR_FOOTPATH_COLOR);
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
});

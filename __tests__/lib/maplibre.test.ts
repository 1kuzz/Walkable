import { describe, expect, it } from "vitest";
import { createVectorStyle, VECTOR_FOOTPATH_COLOR } from "@/lib/maplibre";

describe("createVectorStyle", () => {
  it("keeps walkable paths visually in sync with legend color tokens", () => {
    const style = createVectorStyle();
    const walkablePaths = style.layers.find((layer) => layer.id === "walkable-paths");

    expect(walkablePaths).toBeDefined();
    expect((walkablePaths as { paint?: Record<string, unknown> }).paint?.["line-color"]).toBe(VECTOR_FOOTPATH_COLOR);
  });

  it("filters walkable paths as pathways and excludes road classes", () => {
    const style = createVectorStyle();
    const walkablePaths = style.layers.find((layer) => layer.id === "walkable-paths");

    expect(walkablePaths).toBeDefined();
    const filter = JSON.stringify((walkablePaths as { filter?: unknown }).filter);

    expect(filter).toContain("\"footway\"");
    expect(filter).toContain("\"path\"");
    expect(filter).toContain("\"cycleway\"");
    expect(filter).toContain("\"motorway\"");
    expect(filter).toContain("\"residential\"");
    expect(filter).toContain("\"living_street\"");
  });

  it("guards against non-path transport classes leaking into the path layer", () => {
    const style = createVectorStyle();
    const walkablePaths = style.layers.find((layer) => layer.id === "walkable-paths");

    expect(walkablePaths).toBeDefined();
    const filter = JSON.stringify((walkablePaths as { filter?: unknown }).filter);

    expect(filter).toContain("\"subclass\"");
    expect(filter).toContain("\"rail\"");
    expect(filter).toContain("\"tram\"");
    expect(filter).toContain("\"ferry\"");
    expect(filter).toContain("\"aerialway\"");
  });
});

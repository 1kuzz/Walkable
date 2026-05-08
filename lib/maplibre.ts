import type { GeoJSONSource, LngLatLike, Map, StyleSpecification } from "maplibre-gl";

export type { GeoJSONSource, LngLatLike, Map };

export type MapStyleMode = "satellite" | "walkable";

export function createSatelliteStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Tiles © Esri",
      },
    },
    layers: [
      {
        id: "satellite",
        type: "raster",
        source: "satellite",
      },
    ],
  };
}

/**
 * Walkable-paths style: satellite base + OpenFreeMap vector overlays.
 * Major roads appear as dim, hazy blue river-channels.
 * Footpaths / cycleways appear as bright dotted cream lines.
 * Parks / green areas glow with a soft green tint.
 */
export function createWalkableStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      satellite: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Tiles © Esri",
      },
      openmaptiles: {
        type: "vector",
        // OpenFreeMap serves tiles up to zoom 14; at higher zoom levels MapLibre
        // over-scales the z14 tiles, so road/path detail stays visible.
        tiles: ["https://tiles.openfreemap.org/planet/{z}/{x}/{y}"],
        maxzoom: 14,
        attribution: "© OpenFreeMap © OpenStreetMap contributors",
      },
    },
    layers: [
      // ── Base ──────────────────────────────────────────────────────────
      {
        id: "satellite",
        type: "raster",
        source: "satellite",
      },

      // ── Park / green-area fill ─────────────────────────────────────────
      {
        id: "park-fill",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: [
          "match",
          ["get", "class"],
          ["park", "grass", "recreation_ground", "garden", "forest", "village_green"],
          true,
          false,
        ],
        paint: {
          "fill-color": "rgba(34,197,94,0.18)",
        },
      },
      {
        id: "leisure-park-fill",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "park",
        paint: {
          "fill-color": "rgba(34,197,94,0.12)",
        },
      },

      // ── Roads: major (motorway / trunk / primary / secondary) ──────────
      // Rendered as faint, blurred, blue river-channels
      {
        id: "road-major",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: [
          "match",
          ["get", "class"],
          ["motorway", "trunk", "primary", "secondary"],
          true,
          false,
        ],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#6baed6",
          "line-opacity": 0.25,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 6],
          "line-blur": 3,
        },
      },

      // ── Roads: minor (tertiary / residential / service) ───────────────
      {
        id: "road-minor",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: [
          "match",
          ["get", "class"],
          ["tertiary", "minor", "service"],
          true,
          false,
        ],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#6baed6",
          "line-opacity": 0.15,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 15, 3],
          "line-blur": 2,
        },
      },

      // ── Walkable paths (footway / cycleway / path / pedestrian / steps / track) ──
      // Bright dotted cream lines that stand out against the muted roads
      {
        id: "walkable-paths",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: [
          "match",
          ["get", "class"],
          ["path", "pedestrian", "footway", "cycleway", "steps", "track", "bridleway"],
          true,
          false,
        ],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#f5f0e8",
          "line-opacity": 1,
          "line-width": 2,
          "line-dasharray": [2, 1],
        },
      },
    ],
  };
}

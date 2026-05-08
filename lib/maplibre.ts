import type { GeoJSONSource, LngLatLike, Map, StyleSpecification } from "maplibre-gl";

export type { GeoJSONSource, LngLatLike, Map };

export type MapStyleMode = "satellite" | "walkable" | "vector";

// Legend colours used both in style layers and in the UI legend swatch.
// Exporting them avoids duplication and keeps the UI in sync with the map.
export const VECTOR_FOOTPATH_COLOR = "#3da64a";
export const VECTOR_ROAD_COLOR = "#e06c00";
export const VECTOR_PARK_COLOR = "#cde8c3";
export const WALKABLE_FOOTPATH_COLOR = "#f5f0e8";
export const WALKABLE_ROAD_COLOR = "#6baed6";
export const WALKABLE_PARK_COLOR = "#22c55e";
export const WALKWAY_COLOR = "#d7e8c7";

// Transportation classes treated as roads and explicitly excluded from the
// pathway layer rendering.
const ROAD_TRANSPORT_CLASSES: string[] = [
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "minor",
  "service",
  "residential",
  "unclassified",
  "living_street",
  "motorway_link",
  "trunk_link",
  "primary_link",
  "secondary_link",
  "tertiary_link",
];

// Primary transportation classes that should appear as non-road pathways.
const PATHWAY_TRANSPORT_CLASSES: string[] = [
  "path",
  "pedestrian",
  "footway",
  "cycleway",
  "steps",
  "track",
  "bridleway",
  "corridor",
];

// Subclass-level pathway tags used by some vector tile features.
const PATHWAY_TRANSPORT_SUBCLASSES: string[] = [
  "path",
  "pedestrian",
  "footway",
  "sidewalk",
  "crossing",
  "steps",
  "cycleway",
  "track",
  "bridleway",
  "corridor",
];

// Non-path transport classes to exclude (rail, ferry, aerial, etc.).
const NON_PATH_TRANSPORT_CLASSES: string[] = [
  "rail",
  "transit",
  "aerialway",
  "ferry",
  "runway",
  "taxiway",
];

// Non-path transport subclasses to exclude from pathway rendering.
const NON_PATH_TRANSPORT_SUBCLASSES: string[] = [
  "rail",
  "railway",
  "tram",
  "subway",
  "light_rail",
  "monorail",
  "ferry",
  "aerialway",
  "funicular",
  "gondola",
  "chair_lift",
];

const PATHWAY_DASHARRAY = [2, 1.25];

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
 * Pure-vector "roads as rivers" style.
 * No raster base — every layer is fully customisable.
 * Road widths scale with road class (motorway = wide river, footpath = thin thread).
 */
export function createVectorStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      openmaptiles: {
        type: "vector",
        tiles: ["https://tiles.openfreemap.org/planet/{z}/{x}/{y}"],
        // OpenFreeMap serves tiles up to zoom 14; at higher zoom levels
        // MapLibre over-scales the z14 tiles so detail stays visible.
        // Line-width expressions can still target z16 — they operate on the
        // rendered zoom level, not the tile zoom level.
        maxzoom: 14,
        attribution: "© OpenFreeMap © OpenStreetMap contributors",
      },
    },
    layers: [
      // ── Background ────────────────────────────────────────────────────
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#f8f4f0" },
      },

      // ── Water ─────────────────────────────────────────────────────────
      {
        id: "water-fill",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        paint: { "fill-color": "#a8d8ea" },
      },
      {
        id: "water-stroke",
        type: "line",
        source: "openmaptiles",
        "source-layer": "water",
        paint: { "line-color": "#6bb8d4", "line-width": 1 },
      },

      // ── Landuse fills ─────────────────────────────────────────────────
      {
        id: "landuse-park",
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
        paint: { "fill-color": "#cde8c3" },
      },
      {
        id: "landuse-residential",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["match", ["get", "class"], ["residential", "commercial", "retail"], true, false],
        paint: { "fill-color": "#ede9e4" },
      },
      {
        id: "leisure-park",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "park",
        paint: { "fill-color": "#d6edcc" },
      },

      // ── Buildings ─────────────────────────────────────────────────────
      {
        id: "building-fill",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 14,
        paint: { "fill-color": "#ddd6cd", "fill-outline-color": "#c7bdb4" },
      },

      // ── Road casings (outlines) ───────────────────────────────────────
      {
        id: "road-casing-motorway",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["motorway", "trunk"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#b85000",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 4, 12, 14, 16, 26],
        },
      },
      {
        id: "road-casing-primary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["primary"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#c97a00",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 12, 10, 16, 20],
        },
      },
      {
        id: "road-casing-secondary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["secondary"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#b8a000",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 12, 7, 16, 16],
        },
      },
      {
        id: "road-casing-minor",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["tertiary", "minor", "service"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#b0a090",
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 2, 16, 8],
        },
      },

      // ── Road fills ────────────────────────────────────────────────────
      {
        id: "road-motorway",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["motorway", "trunk"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#e06c00",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2, 12, 8, 16, 18],
        },
      },
      {
        id: "road-primary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["primary"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#f0a500",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.5, 12, 6, 16, 14],
        },
      },
      {
        id: "road-secondary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["secondary"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#f5d000",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 12, 4.5, 16, 12],
        },
      },
      {
        id: "road-minor",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["tertiary", "minor", "service"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1, 16, 6],
        },
      },

      // ── Walkable paths ────────────────────────────────────────────────
      {
        id: "walkable-paths",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: [
          "all",
          ["==", ["geometry-type"], "LineString"],
          [
            "any",
            ["match", ["get", "class"], PATHWAY_TRANSPORT_CLASSES, true, false],
            ["match", ["get", "subclass"], PATHWAY_TRANSPORT_SUBCLASSES, true, false],
          ],
          ["!", ["match", ["get", "class"], ROAD_TRANSPORT_CLASSES, true, false]],
          ["!", ["match", ["get", "subclass"], ROAD_TRANSPORT_CLASSES, true, false]],
          ["!", ["match", ["get", "class"], NON_PATH_TRANSPORT_CLASSES, true, false]],
          ["!", ["match", ["get", "subclass"], NON_PATH_TRANSPORT_SUBCLASSES, true, false]],
        ],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": VECTOR_FOOTPATH_COLOR,
          "line-opacity": 0.95,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 13, 2.2, 16, 4],
          "line-dasharray": PATHWAY_DASHARRAY,
        },
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

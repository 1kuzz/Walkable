import type { Feature, FeatureCollection, LineString, Point, Position } from "geojson";
import nearestPointOnLine from "@turf/nearest-point-on-line";

export interface RouteFeatureProperties {
  id: string;
  name: string;
  color?: string;
  source?: "route" | "draft" | "reroute" | "hover-preview";
}

export type RouteFeature = Feature<LineString, RouteFeatureProperties>;
export interface WalkwayFeatureProperties {
  id: string;
  osmId: string;
  type: string;
  name?: string;
}

export type WalkwayFeature = Feature<LineString, WalkwayFeatureProperties>;
export type PointFeature = Feature<Point>;

export interface SponsoredStopMapItem {
  id: string;
  routeId?: string;
  name: string;
  description?: string | null;
  lat: number;
  lng: number;
  logoUrl?: string | null;
  partnerUrl?: string | null;
}

export function createPointFeature(coordinates: Position): PointFeature {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates,
    },
    properties: {},
  };
}

export function createFeatureCollection<TProperties extends GeoJSON.GeoJsonProperties>(
  features: Feature<LineString, TProperties>[],
): FeatureCollection<LineString, TProperties> {
  return {
    type: "FeatureCollection",
    features,
  };
}

export function parseRouteGeometry(
  geometryGeoJson?: string | null,
  properties?: Partial<RouteFeatureProperties>,
): RouteFeature | null {
  if (!geometryGeoJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(geometryGeoJson) as GeoJSON.Geometry | GeoJSON.Feature<LineString>;
    const geometry = parsed.type === "Feature" ? parsed.geometry : parsed;

    if (!geometry || geometry.type !== "LineString") {
      return null;
    }

    return {
      type: "Feature",
      geometry,
      properties: {
        id: properties?.id ?? crypto.randomUUID(),
        name: properties?.name ?? "Route",
        color: properties?.color,
        source: properties?.source ?? "route",
      },
    };
  } catch {
    return null;
  }
}

export function parseWalkwayGeometry(
  geometryGeoJson?: string | null,
  properties?: Partial<WalkwayFeatureProperties>,
): WalkwayFeature | null {
  if (!geometryGeoJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(geometryGeoJson) as GeoJSON.Geometry | GeoJSON.Feature<LineString>;
    const geometry = parsed.type === "Feature" ? parsed.geometry : parsed;

    if (!geometry || geometry.type !== "LineString") {
      return null;
    }

    const id = properties?.id ?? crypto.randomUUID();

    return {
      type: "Feature",
      geometry,
      properties: {
        id,
        osmId: properties?.osmId ?? id,
        type: properties?.type ?? "path",
        name: properties?.name,
      },
    };
  } catch {
    return null;
  }
}

export function getRouteEndpoints(feature: RouteFeature): Position[] {
  const coordinates = feature.geometry.coordinates;
  if (coordinates.length === 0) {
    return [];
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  return [first, last];
}

export function nearestPointOnRoute(route: RouteFeature, coordinates: Position) {
  const snapped = nearestPointOnLine(route, createPointFeature(coordinates)) as PointFeature & {
    properties?: { index?: number; dist?: number };
  };

  return {
    coordinates: snapped.geometry.coordinates,
    index: snapped.properties?.index,
    distance: snapped.properties?.dist,
  };
}

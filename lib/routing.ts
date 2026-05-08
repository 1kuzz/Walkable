import type { Position } from "geojson";
import type { RouteFeature } from "@/lib/geo";

export interface RoutedPath {
  feature: RouteFeature;
  distanceKm: number;
  durationMin: number;
}

interface OsrmResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: {
      coordinates?: unknown;
    };
  }>;
}

export async function getRoute(waypoints: Position[], name = "Updated route"): Promise<RoutedPath | null> {
  if (waypoints.length < 2) {
    return null;
  }

  const osrmBaseUrl = (process.env.NEXT_PUBLIC_OSRM_BASE_URL ?? "https://router.project-osrm.org").replace(/\/+$/, "");
  const coordinates = waypoints
    .map(([lng, lat]) => `${lng},${lat}`)
    .join(";");

  const url = new URL(`${osrmBaseUrl}/route/v1/foot/${coordinates}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch directions");
  }

  const payload = await response.json() as OsrmResponse;
  if (payload.code !== "Ok") {
    throw new Error("OSRM API returned an error");
  }

  const route = payload.routes?.[0];
  const routeCoordinates = normalizeCoordinates(route?.geometry?.coordinates);
  if (routeCoordinates.length < 2) {
    return null;
  }

  const distanceMeters = typeof route?.distance === "number" ? route.distance : 0;
  const durationSeconds = typeof route?.duration === "number" ? route.duration : 0;

  return {
    feature: {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: routeCoordinates,
      },
      properties: {
        id: `rerouted-${waypoints.length}`,
        name,
        color: "#f97316",
        source: "reroute",
      },
    },
    distanceKm: distanceMeters / 1000,
    durationMin: Math.round(durationSeconds / 60),
  };
}

function normalizeCoordinates(value: unknown): Position[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) {
        return null;
      }
      const lng = point[0];
      const lat = point[1];
      if (typeof lng !== "number" || typeof lat !== "number") {
        return null;
      }
      return [lng, lat] as Position;
    })
    .filter((point): point is Position => Boolean(point));
}

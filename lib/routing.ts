import type { Position } from "geojson";
import type { RouteFeature } from "@/lib/geo";

export interface RoutedPath {
  feature: RouteFeature;
  distanceKm: number;
  durationMin: number;
}

interface CachedRoutedPath {
  coordinates: Position[];
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

const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000;
const ROUTE_CACHE_MAX_ENTRIES = 50;
const routeCache = new Map<string, { value: CachedRoutedPath | null; expiresAt: number }>();
const inFlightRouteRequests = new Map<string, Promise<CachedRoutedPath | null>>();

export async function getRoute(waypoints: Position[], name = "Updated route"): Promise<RoutedPath | null> {
  if (waypoints.length < 2) {
    return null;
  }

  const osrmBaseUrl = (process.env.NEXT_PUBLIC_OSRM_BASE_URL ?? "https://router.project-osrm.org").replace(/\/+$/, "");
  const coordinates = waypoints
    .map(([lng, lat]) => `${lng},${lat}`)
    .join(";");
  const cacheKey = `${osrmBaseUrl}|${coordinates}`;

  evictExpiredRouteCacheEntries();

  const cached = routeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return buildRoutedPath(cached.value, name, waypoints.length);
  }

  const existingRequest = inFlightRouteRequests.get(cacheKey);
  if (existingRequest) {
    const result = await existingRequest;
    return buildRoutedPath(result, name, waypoints.length);
  }

  const request = fetchRouteFromOsrm(osrmBaseUrl, coordinates);
  inFlightRouteRequests.set(cacheKey, request);

  try {
    const result = await request;
    routeCache.set(cacheKey, {
      value: result,
      expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
    });
    trimRouteCache();
    return buildRoutedPath(result, name, waypoints.length);
  } finally {
    inFlightRouteRequests.delete(cacheKey);
  }
}

export function clearRouteCache() {
  routeCache.clear();
  inFlightRouteRequests.clear();
}

async function fetchRouteFromOsrm(osrmBaseUrl: string, coordinates: string): Promise<CachedRoutedPath | null> {

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
    coordinates: routeCoordinates,
    distanceKm: distanceMeters / 1000,
    durationMin: Math.round(durationSeconds / 60),
  };
}

function buildRoutedPath(result: CachedRoutedPath | null, name: string, waypointCount: number): RoutedPath | null {
  if (!result) {
    return null;
  }

  return {
    feature: {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: result.coordinates,
      },
      properties: {
        id: `rerouted-${waypointCount}`,
        name,
        color: "#f97316",
        source: "reroute",
      },
    },
    distanceKm: result.distanceKm,
    durationMin: result.durationMin,
  };
}

function evictExpiredRouteCacheEntries() {
  const now = Date.now();
  routeCache.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      routeCache.delete(key);
    }
  });
}

function trimRouteCache() {
  while (routeCache.size > ROUTE_CACHE_MAX_ENTRIES) {
    const oldestKey = routeCache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    routeCache.delete(oldestKey);
  }
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

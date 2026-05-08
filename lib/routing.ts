import type { Position } from "geojson";
import type { RouteFeature } from "@/lib/geo";

export interface RoutedPath {
  feature: RouteFeature;
  distanceKm: number;
  durationMin: number;
  routing: RoutingDiagnostics;
}

/** How the router should prefer the path. */
export type RoutePreference = "foot" | "park" | "walkable";

/** Options shown in the route-builder preference selector. */
export const ROUTE_PREFERENCES: Array<{ value: RoutePreference; label: string }> = [
  { value: "foot", label: "Standard walking (uses any street)" },
  { value: "park", label: "Park & paths (avoid large roads)" },
  { value: "walkable", label: "Walkable streets only (no car roads)" },
];

interface CachedRoutedPath {
  coordinates: Position[];
  distanceKm: number;
  durationMin: number;
  routing: RoutingDiagnostics;
}

export interface RoutingDiagnostics {
  provider: "ors" | "osrm" | "community" | "hybrid";
  profile: string;
  preference: RoutePreference;
  quality: "preferred" | "fallback";
  /**
   * ORS fallback reasons for park/walkable preferences:
   * - ors_missing_key: no ORS API key configured
   * - ors_error: ORS request failed
   * - ors_no_geometry: ORS succeeded but returned unusable geometry
   * - walkable_fallback_to_park: strict walkable mode fell back to park-aware routing
   */
  fallbackReason?: RoutingFallbackReason;
}

export type RoutingFallbackReason = "ors_missing_key" | "ors_error" | "ors_no_geometry" | "walkable_fallback_to_park";

export interface RouteWaypointHint {
  routeId?: string | null;
}

export interface GetRouteOptions {
  waypointHints?: RouteWaypointHint[];
  knownRouteGeometries?: Record<string, Position[]>;
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

interface OrsGeoJsonResponse {
  features?: Array<{
    geometry?: { coordinates?: unknown };
    properties?: { summary?: { distance?: number; duration?: number } };
  }>;
}

const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000;
const ROUTE_CACHE_MAX_ENTRIES = 50;
const MIN_ROUTE_DURATION_MINUTES = 1;
const WALKING_SPEED_KMH = 5;
const WALKING_OSRM_PROFILES = new Set(["foot", "walking", "pedestrian", "hiking"]);
const routeCache = new Map<string, { value: CachedRoutedPath | null; expiresAt: number }>();
const inFlightRouteRequests = new Map<string, Promise<CachedRoutedPath | null>>();

export function getRoutingFallbackMessage(diagnostics: RoutingDiagnostics | null): string | null {
  if (!diagnostics || diagnostics.quality !== "fallback") {
    return null;
  }

  if (diagnostics.preference === "walkable") {
    if (diagnostics.fallbackReason === "ors_missing_key") {
      return "Walkable-only routing needs ORS configuration; using Park & paths fallback.";
    }
    if (diagnostics.fallbackReason === "ors_error") {
      return "Walkable-only routing provider is temporarily unavailable; using Park & paths fallback.";
    }
    if (diagnostics.fallbackReason === "ors_no_geometry") {
      return "Walkable-only routing returned no usable geometry; using Park & paths fallback.";
    }
    return "Walkable-only routing is unavailable here; using Park & paths fallback.";
  }

  if (diagnostics.preference !== "park") {
    return null;
  }

  if (!diagnostics.fallbackReason) {
    // Defensive guard for partially-populated diagnostics payloads.
    return "Park-aware routing is unavailable; using standard walking network.";
  }

  switch (diagnostics.fallbackReason) {
    case "ors_missing_key":
      return "Park-aware routing provider is not configured; using standard walking network.";
    case "ors_error":
      return "Park-aware routing provider is temporarily unavailable; using standard walking network.";
    case "ors_no_geometry":
      return "Park-aware routing returned no usable park-path geometry; using standard walking network.";
  }
}

export async function getRoute(
  waypoints: Position[],
  name = "Updated route",
  preference: RoutePreference = "park",
  options?: GetRouteOptions,
): Promise<RoutedPath | null> {
  if (waypoints.length < 2) {
    return null;
  }

  const osrmBaseUrl = (process.env.NEXT_PUBLIC_OSRM_BASE_URL ?? "https://router.project-osrm.org").replace(/\/+$/, "");
  const osrmProfile = resolveWalkingOsrmProfile();
  const coordinates = waypoints
    .map(([lng, lat]) => `${lng},${lat}`)
    .join(";");
  const hintsKey = options?.waypointHints
    ?.map((hint, index) => `${index}:${hint.routeId ?? "-"}`)
    .join("|");
  const cacheKey = `${preference}|${osrmBaseUrl}|${osrmProfile}|${coordinates}|${hintsKey ?? ""}`;

  evictExpiredRouteCacheEntries();

  const cached = routeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    touchRouteCacheEntry(cacheKey, cached);
    return buildRoutedPath(cached.value, name, waypoints.length);
  }

  const existingRequest = inFlightRouteRequests.get(cacheKey);
  if (existingRequest) {
    const result = await existingRequest;
    return buildRoutedPath(result, name, waypoints.length);
  }

  const request = fetchRoute(osrmBaseUrl, osrmProfile, coordinates, waypoints, preference, options);
  inFlightRouteRequests.set(cacheKey, request);

  try {
    const result = await request;
    touchRouteCacheEntry(cacheKey, {
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

/**
 * Dispatches routing to ORS (park preference, when API key is available) or OSRM.
 * Falls back to OSRM if ORS is unavailable or fails.
 */
async function fetchRoute(
  osrmBaseUrl: string,
  osrmProfile: string,
  coordinates: string,
  waypoints: Position[],
  preference: RoutePreference,
  options?: GetRouteOptions,
): Promise<CachedRoutedPath | null> {
  if (preference === "park") {
    return fetchSegmentedParkRoute({
      osrmBaseUrl,
      osrmProfile,
      waypoints,
      preference,
      waypointHints: options?.waypointHints,
      knownRouteGeometries: options?.knownRouteGeometries,
    });
  }
  if (preference === "walkable") {
    return fetchSegmentedWalkableRoute({
      osrmBaseUrl,
      osrmProfile,
      waypoints,
      waypointHints: options?.waypointHints,
      knownRouteGeometries: options?.knownRouteGeometries,
    });
  }
  return fetchRouteFromOsrm(osrmBaseUrl, osrmProfile, coordinates, {
    preference,
    quality: "preferred",
  });
}

async function fetchRouteFromOsrm(
  osrmBaseUrl: string,
  osrmProfile: string,
  coordinates: string,
  routingContext: {
    preference: RoutePreference;
    quality: "preferred" | "fallback";
    fallbackReason?: RoutingFallbackReason;
  },
): Promise<CachedRoutedPath | null> {

  const url = new URL(`${osrmBaseUrl}/route/v1/${osrmProfile}/${coordinates}`);
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
    routing: {
      provider: "osrm",
      profile: osrmProfile,
      preference: routingContext.preference,
      quality: routingContext.quality,
      fallbackReason: routingContext.fallbackReason,
    },
  };
}

async function fetchRouteFromOrs(apiKey: string, waypoints: Position[], preference: RoutePreference): Promise<CachedRoutedPath | null> {
  const avoidFeatures = ["highways", "tollways", "ferries", "fords", "roads"];
  const profileParams = {
    weightings: {
      green: { factor: 1 },
      steepness_difficulty: 1,
    },
  };
  // ORS v2 accepts the API key in the Authorization header as a bare token (no "Bearer" prefix).
  const response = await fetch(
    "https://api.openrouteservice.org/v2/directions/foot-walking/geojson",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // ORS v2 authenticates with a bare API key token in the Authorization header.
        Authorization: apiKey,
      },
      body: JSON.stringify({
        coordinates: waypoints,
        preference: "recommended",
        options: {
          avoid_features: avoidFeatures,
          profile_params: profileParams,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error("ORS request failed");
  }

  const payload = await response.json() as OrsGeoJsonResponse;
  const feature = payload.features?.[0];
  const routeCoordinates = normalizeCoordinates(feature?.geometry?.coordinates);
  if (routeCoordinates.length < 2) {
    // ORS returned a valid response but no usable geometry; caller will fall back to OSRM.
    return null;
  }

  const distanceMeters = typeof feature?.properties?.summary?.distance === "number"
    ? feature.properties.summary.distance
    : 0;
  const durationSeconds = typeof feature?.properties?.summary?.duration === "number"
    ? feature.properties.summary.duration
    : 0;

  return {
    coordinates: routeCoordinates,
    distanceKm: distanceMeters / 1000,
    durationMin: Math.round(durationSeconds / 60),
    routing: {
      provider: "ors",
      profile: "foot-walking",
      preference,
      quality: "preferred",
    },
  };
}

async function fetchSegmentedParkRoute({
  osrmBaseUrl,
  osrmProfile,
  waypoints,
  preference,
  waypointHints,
  knownRouteGeometries,
}: {
  osrmBaseUrl: string;
  osrmProfile: string;
  waypoints: Position[];
  preference: RoutePreference;
  waypointHints?: RouteWaypointHint[];
  knownRouteGeometries?: Record<string, Position[]>;
}): Promise<CachedRoutedPath | null> {
  const legResults: CachedRoutedPath[] = [];
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const legStart = waypoints[index];
    const legEnd = waypoints[index + 1];
    const startHint = waypointHints?.[index];
    const endHint = waypointHints?.[index + 1];

    const preferredCommunityLeg = buildCommunityLeg(
      legStart,
      legEnd,
      startHint,
      endHint,
      knownRouteGeometries,
      preference,
    );
    if (preferredCommunityLeg) {
      legResults.push(preferredCommunityLeg);
      continue;
    }

    const networkLeg = await fetchParkNetworkLeg({
      osrmBaseUrl,
      osrmProfile,
      legStart,
      legEnd,
      preference,
    });
    if (!networkLeg) {
      return null;
    }
    legResults.push(networkLeg);
  }

  return combineLegResults(legResults, preference);
}

async function fetchSegmentedWalkableRoute({
  osrmBaseUrl,
  osrmProfile,
  waypoints,
  waypointHints,
  knownRouteGeometries,
}: {
  osrmBaseUrl: string;
  osrmProfile: string;
  waypoints: Position[];
  waypointHints?: RouteWaypointHint[];
  knownRouteGeometries?: Record<string, Position[]>;
}): Promise<CachedRoutedPath | null> {
  const legResults: CachedRoutedPath[] = [];
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const legStart = waypoints[index];
    const legEnd = waypoints[index + 1];
    const startHint = waypointHints?.[index];
    const endHint = waypointHints?.[index + 1];

    const preferredCommunityLeg = buildCommunityLeg(
      legStart,
      legEnd,
      startHint,
      endHint,
      knownRouteGeometries,
      "walkable",
    );
    if (preferredCommunityLeg) {
      legResults.push(preferredCommunityLeg);
      continue;
    }

    const networkLeg = await fetchWalkableNetworkLeg({
      osrmBaseUrl,
      osrmProfile,
      legStart,
      legEnd,
    });
    if (!networkLeg) {
      return null;
    }
    legResults.push(networkLeg);
  }

  return combineLegResults(legResults, "walkable");
}

async function fetchWalkableNetworkLeg({
  osrmBaseUrl,
  osrmProfile,
  legStart,
  legEnd,
}: {
  osrmBaseUrl: string;
  osrmProfile: string;
  legStart: Position;
  legEnd: Position;
}): Promise<CachedRoutedPath | null> {
  const orsApiKey = process.env.NEXT_PUBLIC_ORS_API_KEY;
  if (orsApiKey) {
    try {
      const orsResult = await fetchRouteFromOrs(orsApiKey, [legStart, legEnd], "walkable");
      if (orsResult) {
        return orsResult;
      }
    } catch {
      // Fallback to park preference logic below.
    }
  }

  const fallbackLeg = await fetchParkNetworkLeg({
    osrmBaseUrl,
    osrmProfile,
    legStart,
    legEnd,
    preference: "park",
  });
  if (!fallbackLeg) {
    return null;
  }

  return {
    ...fallbackLeg,
    routing: {
      ...fallbackLeg.routing,
      preference: "walkable",
      quality: "fallback",
      fallbackReason: fallbackLeg.routing.fallbackReason ?? (
        orsApiKey
          ? "walkable_fallback_to_park"
          : "ors_missing_key"
      ),
    },
  };
}

async function fetchParkNetworkLeg({
  osrmBaseUrl,
  osrmProfile,
  legStart,
  legEnd,
  preference,
}: {
  osrmBaseUrl: string;
  osrmProfile: string;
  legStart: Position;
  legEnd: Position;
  preference: RoutePreference;
}): Promise<CachedRoutedPath | null> {
  const coordinates = `${legStart[0]},${legStart[1]};${legEnd[0]},${legEnd[1]}`;
  const orsApiKey = process.env.NEXT_PUBLIC_ORS_API_KEY;
  if (orsApiKey) {
    try {
      const orsResult = await fetchRouteFromOrs(orsApiKey, [legStart, legEnd], preference);
      if (orsResult) {
        return orsResult;
      }
      return fetchRouteFromOsrm(osrmBaseUrl, osrmProfile, coordinates, {
        preference,
        quality: "fallback",
        fallbackReason: "ors_no_geometry",
      });
    } catch {
      return fetchRouteFromOsrm(osrmBaseUrl, osrmProfile, coordinates, {
        preference,
        quality: "fallback",
        fallbackReason: "ors_error",
      });
    }
  }
  return fetchRouteFromOsrm(osrmBaseUrl, osrmProfile, coordinates, {
    preference,
    quality: "fallback",
    fallbackReason: "ors_missing_key",
  });
}

function buildCommunityLeg(
  legStart: Position,
  legEnd: Position,
  startHint: RouteWaypointHint | undefined,
  endHint: RouteWaypointHint | undefined,
  knownRouteGeometries: Record<string, Position[]> | undefined,
  preference: RoutePreference,
): CachedRoutedPath | null {
  if (!knownRouteGeometries || !startHint?.routeId || startHint.routeId !== endHint?.routeId) {
    return null;
  }

  const routeCoordinates = knownRouteGeometries[startHint.routeId];
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
    return null;
  }

  const slicedCoordinates = sliceRouteBetweenNearestVertices(routeCoordinates, legStart, legEnd);
  if (slicedCoordinates.length < 2) {
    return null;
  }

  const distanceKm = computePathDistanceKm(slicedCoordinates);
  const durationMin = Math.max(MIN_ROUTE_DURATION_MINUTES, Math.round((distanceKm / WALKING_SPEED_KMH) * 60));
  return {
    coordinates: slicedCoordinates,
    distanceKm,
    durationMin,
    routing: {
      provider: "community",
      profile: "community-path",
      preference,
      quality: "preferred",
    },
  };
}

function combineLegResults(legs: CachedRoutedPath[], preference: RoutePreference): CachedRoutedPath | null {
  if (legs.length === 0) {
    return null;
  }

  const coordinates: Position[] = [];
  let distanceKm = 0;
  let durationMin = 0;
  let hasCommunity = false;
  let hasOrs = false;
  let hasOsrm = false;
  let hasFallback = false;
  let fallbackReason: RoutingFallbackReason | undefined;

  legs.forEach((leg, legIndex) => {
    leg.coordinates.forEach((coordinate, coordinateIndex) => {
      if (legIndex > 0 && coordinateIndex === 0) {
        return;
      }
      coordinates.push(coordinate);
    });
    distanceKm += leg.distanceKm;
    durationMin += leg.durationMin;
    hasCommunity ||= leg.routing.provider === "community";
    hasOrs ||= leg.routing.provider === "ors";
    hasOsrm ||= leg.routing.provider === "osrm";
    hasFallback ||= leg.routing.quality === "fallback";
    if (!fallbackReason && leg.routing.fallbackReason) {
      fallbackReason = leg.routing.fallbackReason;
    }
  });

  let provider: RoutingDiagnostics["provider"];
  if (hasCommunity && (hasOrs || hasOsrm)) {
    provider = "hybrid";
  } else if (hasCommunity) {
    provider = "community";
  } else if (hasOrs) {
    provider = "ors";
  } else {
    provider = "osrm";
  }

  let profile: string;
  if (provider === "hybrid") {
    profile = ["community-path", hasOrs ? "foot-walking" : null, hasOsrm ? "foot" : null].filter(Boolean).join("+");
  } else if (provider === "community") {
    profile = "community-path";
  } else if (provider === "ors") {
    profile = "foot-walking";
  } else {
    profile = "foot";
  }

  return {
    coordinates,
    distanceKm,
    durationMin: Math.max(MIN_ROUTE_DURATION_MINUTES, Math.round(durationMin)),
    routing: {
      provider,
      profile,
      preference,
      quality: hasFallback ? "fallback" : "preferred",
      fallbackReason,
    },
  };
}

function sliceRouteBetweenNearestVertices(routeCoordinates: Position[], legStart: Position, legEnd: Position): Position[] {
  const startIndex = findNearestVertexIndex(routeCoordinates, legStart);
  const endIndex = findNearestVertexIndex(routeCoordinates, legEnd);
  if (startIndex < 0 || endIndex < 0) {
    return [];
  }

  const minIndex = Math.min(startIndex, endIndex);
  const maxIndex = Math.max(startIndex, endIndex);
  const coreSegment = routeCoordinates.slice(minIndex, maxIndex + 1);
  const orientedCoreSegment = startIndex <= endIndex ? coreSegment : [...coreSegment].reverse();
  return dedupeSequentialCoordinates([legStart, ...orientedCoreSegment, legEnd]);
}

function dedupeSequentialCoordinates(coordinates: Position[]): Position[] {
  return coordinates.filter((coordinate, index) => {
    if (index === 0) {
      return true;
    }
    const previous = coordinates[index - 1];
    return previous[0] !== coordinate[0] || previous[1] !== coordinate[1];
  });
}

function findNearestVertexIndex(routeCoordinates: Position[], target: Position): number {
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  routeCoordinates.forEach((coordinate, index) => {
    const distance = squaredDistance(coordinate, target);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

function squaredDistance(a: Position, b: Position): number {
  const lngDelta = a[0] - b[0];
  const latDelta = a[1] - b[1];
  return lngDelta * lngDelta + latDelta * latDelta;
}

function computePathDistanceKm(coordinates: Position[]): number {
  let distanceKm = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    distanceKm += haversineDistanceKm(coordinates[index - 1], coordinates[index]);
  }
  return distanceKm;
}

function haversineDistanceKm(a: Position, b: Position): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(b[1] - a[1]);
  const dLng = toRadians(b[0] - a[0]);
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const haversine = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return earthRadiusKm * c;
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
        routingPreference: result.routing.preference,
        routingQuality: result.routing.quality,
      },
    },
    distanceKm: result.distanceKm,
    durationMin: result.durationMin,
    routing: result.routing,
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
  // Accessed entries are re-inserted via touchRouteCacheEntry, so insertion order reflects LRU order here.
  while (routeCache.size > ROUTE_CACHE_MAX_ENTRIES) {
    const oldestKey = routeCache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    routeCache.delete(oldestKey);
  }
}

function touchRouteCacheEntry(key: string, entry: { value: CachedRoutedPath | null; expiresAt: number }) {
  routeCache.delete(key);
  routeCache.set(key, entry);
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

function resolveWalkingOsrmProfile(): string {
  const configuredProfile = process.env.NEXT_PUBLIC_OSRM_PROFILE?.trim().toLowerCase();
  if (!configuredProfile) {
    return "foot";
  }
  return WALKING_OSRM_PROFILES.has(configuredProfile) ? configuredProfile : "foot";
}

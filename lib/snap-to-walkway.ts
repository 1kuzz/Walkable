import type { Position } from "geojson";
import { isValidRoutePosition } from "@/lib/routing-coordinates";

const DEFAULT_OSRM_BASE_URL = "https://router.project-osrm.org";
const EARTH_RADIUS_METERS = 6_371_000;

type OsrmNearestProfile = "foot" | "car";

interface OsrmNearestResponse {
  code?: string;
  waypoints?: Array<{
    location?: unknown;
  }>;
}

export async function snapToNearestWalkway(position: Position): Promise<Position> {
  return snapToNearestNetwork(position, "foot");
}

export async function snapToNearestRoad(position: Position): Promise<Position> {
  return snapToNearestNetwork(position, "car");
}

export function isSignificantSnap(original: Position, snapped: Position, thresholdMeters = 50): boolean {
  return haversineDistanceMeters(original, snapped) > thresholdMeters;
}

async function snapToNearestNetwork(position: Position, profile: OsrmNearestProfile): Promise<Position> {
  if (!isValidRoutePosition(position)) {
    return position;
  }

  const osrmBaseUrl = resolveOsrmBaseUrl();
  const [lng, lat] = position;
  const url = new URL(`${osrmBaseUrl}/nearest/v1/${profile}/${lng},${lat}`);
  url.searchParams.set("number", "1");

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return position;
    }

    const payload = await response.json() as OsrmNearestResponse;
    if (payload.code !== "Ok") {
      return position;
    }
    const location = payload.waypoints?.[0]?.location;
    if (!Array.isArray(location) || location.length < 2) {
      return position;
    }
    const snapped: Position = [location[0], location[1]];
    return isValidRoutePosition(snapped) ? snapped : position;
  } catch {
    return position;
  }
}

function resolveOsrmBaseUrl(): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_OSRM_BASE_URL?.trim();
  if (!configuredBaseUrl) {
    return DEFAULT_OSRM_BASE_URL;
  }

  try {
    const parsed = new URL(configuredBaseUrl);
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password) {
      return DEFAULT_OSRM_BASE_URL;
    }
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_OSRM_BASE_URL;
  }
}

function haversineDistanceMeters(a: Position, b: Position): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b[1] - a[1]);
  const dLng = toRadians(b[0] - a[0]);
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const haversine = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return EARTH_RADIUS_METERS * c;
}

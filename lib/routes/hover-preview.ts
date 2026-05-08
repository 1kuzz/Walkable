import type { Position } from "geojson";
import type { RoutePreference } from "@/lib/routing";

export function createHoverPreviewResetKey(waypoints: Position[], preference: RoutePreference): string {
  const serializedWaypoints = waypoints
    .map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
    .join("|");
  return `${preference}:${serializedWaypoints}`;
}

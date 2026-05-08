import type { Position } from "geojson";
import type { GetRouteOptions, RoutePreference, RoutedPath } from "@/lib/routing";

interface RouteRequestPayload {
  waypoints: Position[];
  name?: string;
  preference?: RoutePreference;
  options?: GetRouteOptions;
}

export async function getRouteFromApi(
  waypoints: Position[],
  name = "Updated route",
  preference: RoutePreference = "park",
  options?: GetRouteOptions,
): Promise<RoutedPath | null> {
  const response = await fetch("/api/routing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      waypoints,
      name,
      preference,
      options,
    } satisfies RouteRequestPayload),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Failed to fetch directions (${response.status})${details ? `: ${details}` : ""}`);
  }

  return response.json() as Promise<RoutedPath | null>;
}

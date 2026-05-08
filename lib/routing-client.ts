import type { Position } from "geojson";
import { DEFAULT_ROUTE_NAME } from "@/lib/routing-defaults";
import type { GetRouteOptions, RoutePreference, RoutedPath } from "@/lib/routing";

interface RouteRequestPayload {
  waypoints: Position[];
  name?: string;
  preference?: RoutePreference;
  options?: GetRouteOptions;
}

export async function getRouteFromApi(
  waypoints: Position[],
  name = DEFAULT_ROUTE_NAME,
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
    let details = "";
    let detailReadFailed = false;
    try {
      details = await response.text();
    } catch {
      detailReadFailed = true;
    }
    throw new Error(
      `Failed to fetch directions (${response.status})${details ? `: ${details}` : ""}${detailReadFailed ? " [response body unavailable]" : ""}`,
    );
  }

  return response.json() as Promise<RoutedPath | null>;
}

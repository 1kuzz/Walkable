import type { Position } from "geojson";
import type { RouteFeature } from "@/lib/geo";

export interface RoutedPath {
  feature: RouteFeature;
  distanceKm: number;
  durationMin: number;
}

export async function getRoute(waypoints: Position[], name = "Updated route"): Promise<RoutedPath | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || waypoints.length < 2) {
    return null;
  }

  const coords = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coords}?alternatives=false&continue_straight=true&geometries=geojson&overview=full&steps=false&access_token=${token}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch directions");
  }

  const payload = await response.json() as {
    routes?: Array<{
      geometry?: GeoJSON.LineString;
      distance?: number;
      duration?: number;
    }>;
  };

  const route = payload.routes?.[0];
  if (!route?.geometry) {
    return null;
  }

  return {
    feature: {
      type: "Feature",
      geometry: route.geometry,
      properties: {
        id: `rerouted-${waypoints.length}`,
        name,
        color: "#f97316",
        source: "reroute",
      },
    },
    distanceKm: (route.distance ?? 0) / 1000,
    durationMin: Math.round((route.duration ?? 0) / 60),
  };
}

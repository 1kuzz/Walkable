import type { Position } from "geojson";
import type { RouteFeature } from "@/lib/geo";
import { loadYandexMapsApi, toGeoJsonCoordinates, toYandexCoordinates } from "@/lib/yandex-maps";

export interface RoutedPath {
  feature: RouteFeature;
  distanceKm: number;
  durationMin: number;
}

export async function getRoute(waypoints: Position[], name = "Updated route"): Promise<RoutedPath | null> {
  if (waypoints.length < 2) {
    return null;
  }

  const ymaps = await loadYandexMapsApi();
  if (!ymaps) {
    return null;
  }

  const route = await new Promise<{
    coordinates: Position[];
    distanceMeters: number;
    durationSeconds: number;
  }>((resolve, reject) => {
    const multiRoute = new ymaps.multiRouter.MultiRoute({
      referencePoints: waypoints.map(toYandexCoordinates),
      params: {
        routingMode: "pedestrian",
      },
    });

    multiRoute.model.events.add("requestsuccess", () => {
      const activeRoute = multiRoute.getActiveRoute();
      if (!activeRoute) {
        resolve({ coordinates: [], distanceMeters: 0, durationSeconds: 0 });
        return;
      }

      const coordinates = readCollection<{ getCoordinates(): number[][] }>(activeRoute.getPaths())
        .flatMap((path, index) => {
          const segment = path.getCoordinates().map(toGeoJsonCoordinates);
          return index === 0 ? segment : segment.slice(1);
        });
      const distanceMeters = readMetricValue(activeRoute.properties.get("distance"));
      const durationSeconds = readMetricValue(activeRoute.properties.get("duration"));

      resolve({ coordinates, distanceMeters, durationSeconds });
    });

    multiRoute.model.events.add("requestfail", () => {
      reject(new Error("Failed to fetch directions"));
    });
  });

  if (route.coordinates.length === 0) {
    return null;
  }

  return {
    feature: {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: route.coordinates,
      },
      properties: {
        id: `rerouted-${waypoints.length}`,
        name,
        color: "#f97316",
        source: "reroute",
      },
    },
    distanceKm: route.distanceMeters / 1000,
    durationMin: Math.round(route.durationSeconds / 60),
  };
}

function readCollection<T>(collection: unknown): T[] {
  if (!collection) {
    return [];
  }

  if (Array.isArray(collection)) {
    return collection as T[];
  }

  const maybeCollection = collection as {
    toArray?: () => T[];
    getLength?: () => number;
    get?: (index: number) => T;
  };

  if (typeof maybeCollection.toArray === "function") {
    return maybeCollection.toArray();
  }

  if (typeof maybeCollection.getLength === "function" && typeof maybeCollection.get === "function") {
    return Array.from({ length: maybeCollection.getLength() }, (_, index) => maybeCollection.get?.(index)).filter(
      (item): item is T => Boolean(item),
    );
  }

  return [];
}

function readMetricValue(metric: unknown): number {
  if (typeof metric === "number") {
    return metric;
  }

  if (metric && typeof metric === "object") {
    const value = (metric as { value?: unknown }).value;
    if (typeof value === "number") {
      return value;
    }
  }

  return 0;
}

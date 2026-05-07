"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import FilterSidebar, { FilterState } from "@/components/routes/FilterSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { parseRouteGeometry, type RouteFeature } from "@/lib/geo";

const MapContainer = dynamic(() => import("@/components/map/MapContainer"), { ssr: false, loading: () => <Skeleton className="w-full h-full" /> });

const defaultFilters: FilterState = { parkTypes: [], difficulties: [], maxLength: 20, sort: "popular" };

interface ApiRoute {
  id: string;
  name: string;
  difficulty: "easy" | "moderate" | "hard";
  geometryGeoJson?: string | null;
}

export default function MapPage() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [routes, setRoutes] = useState<ApiRoute[]>([]);
  const [nextDestination, setNextDestination] = useState<{ routeName: string; coordinates: [number, number] } | null>(null);

  useEffect(() => {
    fetch(`/api/routes?sort=${filters.sort}`)
      .then(async (response) => response.json())
      .then((payload) => setRoutes(Array.isArray(payload) ? payload : []))
      .catch(() => setRoutes([]));
  }, [filters.sort]);

  const routeFeatures = useMemo<RouteFeature[]>(() => {
    return routes
      .map((route) => parseRouteGeometry(route.geometryGeoJson, { id: route.id, name: route.name, color: "#22c55e" }))
      .filter((feature): feature is RouteFeature => Boolean(feature));
  }, [routes]);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      <div className={`${sidebarOpen ? "w-80" : "w-0"} shrink-0 overflow-y-auto border-r bg-background transition-all duration-300 z-10`}>
        <div className="p-4">
          <FilterSidebar filters={filters} onChange={setFilters} />
        </div>
      </div>

      <div className="flex-1 relative">
        <MapContainer
          className="w-full h-full"
          routes={routeFeatures}
          onRoutePointSelect={({ routeName, coordinates }) => setNextDestination({ routeName, coordinates: [coordinates[0], coordinates[1]] })}
        />
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-4 left-4 z-10 bg-background border rounded-lg p-2 shadow-md hover:bg-muted transition-colors"
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? "◀" : "▶"}
        </button>
        {nextDestination && (
          <div className="absolute bottom-4 left-1/2 z-10 w-full max-w-sm -translate-x-1/2 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur">
            <p className="text-sm font-medium">Next destination selected</p>
            <p className="text-sm text-muted-foreground">{nextDestination.routeName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {nextDestination.coordinates[1].toFixed(5)}, {nextDestination.coordinates[0].toFixed(5)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

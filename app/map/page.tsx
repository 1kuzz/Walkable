"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import type { Position } from "geojson";
import FilterSidebar, { FilterState } from "@/components/routes/FilterSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { parseRouteGeometry, parseWalkwayGeometry, type RouteFeature, type WalkwayFeature } from "@/lib/geo";
import { snapToNearestWalkway } from "@/lib/snap-to-walkway";

const MapContainer = dynamic(() => import("@/components/map/MapContainer"), { ssr: false, loading: () => <Skeleton className="w-full h-full" /> });

const defaultFilters: FilterState = { parkTypes: [], difficulties: [], maxLength: 20, sort: "popular" };
const MD_BREAKPOINT = "(min-width: 768px)";

interface ApiRoute {
  id: string;
  name: string;
  difficulty: "easy" | "moderate" | "hard";
  geometryGeoJson?: string | null;
}

interface ApiWalkway {
  id: string;
  osmId: string;
  name?: string | null;
  type: string;
  geometryGeoJson?: string | null;
}

function isDesktop() {
  return typeof window !== "undefined" && window.matchMedia(MD_BREAKPOINT).matches;
}

function subscribeToDesktopMediaQuery(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const mediaQuery = window.matchMedia(MD_BREAKPOINT);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

export default function MapPage() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const isDesktopViewport = useSyncExternalStore(subscribeToDesktopMediaQuery, isDesktop, () => false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [routes, setRoutes] = useState<ApiRoute[]>([]);
  const [walkways, setWalkways] = useState<ApiWalkway[]>([]);
  const [nextDestination, setNextDestination] = useState<{ routeName: string; coordinates: [number, number] } | null>(null);
  const [nearbyPathPoint, setNearbyPathPoint] = useState<Position | null>(null);
  const [locatingNearbyPath, setLocatingNearbyPath] = useState(false);
  const [nearbyPathError, setNearbyPathError] = useState<string | null>(null);
  const sidebarOpen = isDesktopViewport ? desktopSidebarOpen : mobileSidebarOpen;

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/routes?sort=${filters.sort}`, {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then(async (response) => response.json())
      .then((payload) => setRoutes(Array.isArray(payload) ? payload : []))
      .catch(() => {
        if (!controller.signal.aborted) {
          setRoutes([]);
        }
      });

    return () => {
      controller.abort();
    };
  }, [filters.sort]);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/walkways", {
      cache: "default",
      signal: controller.signal,
    })
      .then(async (response) => response.json())
      .then((payload) => setWalkways(Array.isArray(payload) ? payload : []))
      .catch(() => {
        if (!controller.signal.aborted) {
          setWalkways([]);
        }
      });

    return () => {
      controller.abort();
    };
  }, []);

  const routeFeatures = useMemo<RouteFeature[]>(() => {
    return routes
      .map((route) => parseRouteGeometry(route.geometryGeoJson, { id: route.id, name: route.name, color: "#22c55e" }))
      .filter((feature): feature is RouteFeature => Boolean(feature));
  }, [routes]);

  const walkwayFeatures = useMemo<WalkwayFeature[]>(() => {
    return walkways
      .map((walkway) => parseWalkwayGeometry(walkway.geometryGeoJson, {
        id: walkway.id,
        osmId: walkway.osmId,
        name: walkway.name ?? undefined,
        type: walkway.type,
      }))
      .filter((feature): feature is WalkwayFeature => Boolean(feature));
  }, [walkways]);

  const nearbyPathMarker = useMemo(
    () => (nearbyPathPoint ? [{ id: "nearby-path", lat: nearbyPathPoint[1], lng: nearbyPathPoint[0], label: "P" }] : []),
    [nearbyPathPoint],
  );

  const handleFindNearbyPath = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setNearbyPathError("Geolocation is unavailable in this browser.");
      return;
    }
    setLocatingNearbyPath(true);
    setNearbyPathError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const currentPoint: Position = [position.coords.longitude, position.coords.latitude];
        const snapped = await snapToNearestWalkway(currentPoint);
        setNearbyPathPoint(snapped);
        setLocatingNearbyPath(false);
      },
      () => {
        setNearbyPathError("Could not access your location.");
        setLocatingNearbyPath(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      },
    );
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden relative">
      {/* Overlay for mobile when sidebar is open */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 bg-black/40 z-10 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 ${sidebarOpen ? "md:w-80" : "md:w-0"} absolute md:relative z-20 h-full w-80 shrink-0 overflow-y-auto border-r bg-background transition-transform md:transition-all duration-300`}>
        <div className="p-4">
          <FilterSidebar filters={filters} onChange={(f) => {
            setFilters(f);
            if (!isDesktopViewport) setMobileSidebarOpen(false);
          }} />
        </div>
      </div>

      <div className="flex-1 relative">
        <MapContainer
          className="h-full w-full"
          routes={routeFeatures}
          walkways={walkwayFeatures}
          waypoints={nearbyPathMarker}
          onRoutePointSelect={({ routeName, coordinates }) => setNextDestination({ routeName, coordinates: [coordinates[0], coordinates[1]] })}
        />
        <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
          <Button size="sm" variant="outline" onClick={handleFindNearbyPath} disabled={locatingNearbyPath}>
            {locatingNearbyPath ? "Finding path…" : "Nearby paths"}
          </Button>
          {nearbyPathError && (
            <p className="max-w-xs rounded-md border bg-background/95 px-2 py-1 text-xs text-destructive shadow">
              {nearbyPathError}
            </p>
          )}
        </div>
        <button
          onClick={() => {
            if (isDesktopViewport) {
              setDesktopSidebarOpen((open) => !open);
              return;
            }
            setMobileSidebarOpen((open) => !open);
          }}
          className="absolute top-4 left-4 z-20 bg-background border rounded-lg p-2.5 shadow-md hover:bg-muted active:scale-95 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Toggle filters"
        >
          {sidebarOpen ? "◀" : "▶"}
        </button>
        {nextDestination && (
          <div className="absolute bottom-4 left-1/2 z-20 w-full max-w-sm -translate-x-1/2 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur">
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

"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { Position } from "geojson";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import RouteOptions from "@/components/routes/RouteOptions";
import { estimateCalories } from "@/lib/calories";
import { parseRouteGeometry, type RouteFeature, type SponsoredStopMapItem } from "@/lib/geo";
import { getRoute } from "@/lib/routing";

const MapContainer = dynamic(() => import("@/components/map/MapContainer"), {
  ssr: false,
  loading: () => <Skeleton className="w-full h-full" />,
});

interface BuilderWaypoint {
  lat: number;
  lng: number;
  name: string;
  routeId?: string;
}

interface ApiRoute {
  id: string;
  name: string;
  geometryGeoJson?: string | null;
}

interface DraftRouteState {
  feature: RouteFeature | null;
  distanceKm: number;
  durationMin: number;
}

const emptyDraftRouteState: DraftRouteState = {
  feature: null,
  distanceKm: 0,
  durationMin: 0,
};

export default function RouteBuilderPage() {
  const [routeName, setRouteName] = useState("");
  const [baseRoutes, setBaseRoutes] = useState<ApiRoute[]>([]);
  const [waypoints, setWaypoints] = useState<BuilderWaypoint[]>([]);
  const [draftRouteState, setDraftRouteState] = useState<DraftRouteState>(emptyDraftRouteState);
  const [includeFoodStops, setIncludeFoodStops] = useState(false);
  const [loadingStops, setLoadingStops] = useState(false);
  const [sponsoredStops, setSponsoredStops] = useState<SponsoredStopMapItem[]>([]);
  const [selectedSponsoredStopId, setSelectedSponsoredStopId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/routes?sort=popular")
      .then(async (response) => response.json())
      .then((payload) => setBaseRoutes(Array.isArray(payload) ? payload : []))
      .catch(() => setBaseRoutes([]));
  }, []);

  const waypointPositions = useMemo<Position[]>(() => waypoints.map((waypoint) => [waypoint.lng, waypoint.lat]), [waypoints]);
  const effectiveSponsoredStops = includeFoodStops ? sponsoredStops : [];
  const effectiveSelectedSponsoredStopId = includeFoodStops ? selectedSponsoredStopId : null;
  const visibleDraftRoute = waypointPositions.length >= 2 ? draftRouteState.feature : null;
  const visibleDistanceKm = waypointPositions.length >= 2 ? draftRouteState.distanceKm : 0;
  const visibleDurationMin = waypointPositions.length >= 2 ? draftRouteState.durationMin : 0;

  useEffect(() => {
    if (waypointPositions.length < 2) {
      return;
    }

    const points = [...waypointPositions];
    if (effectiveSelectedSponsoredStopId) {
      const stop = sponsoredStops.find((item) => item.id === effectiveSelectedSponsoredStopId);
      if (stop) {
        points.splice(1, 0, [stop.lng, stop.lat]);
      }
    }

    let cancelled = false;
    getRoute(points, routeName || "Draft route")
      .then((result) => {
        if (!cancelled) {
          setDraftRouteState(
            result
              ? {
                  feature: {
                    ...result.feature,
                    properties: {
                      ...result.feature.properties,
                      id: "draft-route",
                      color: "#f97316",
                      source: "draft",
                    },
                  },
                  distanceKm: result.distanceKm,
                  durationMin: result.durationMin,
                }
              : emptyDraftRouteState,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDraftRouteState(emptyDraftRouteState);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveSelectedSponsoredStopId, routeName, sponsoredStops, waypointPositions]);

  useEffect(() => {
    if (!includeFoodStops) {
      return;
    }

    const center = waypoints.at(-1) ?? { lat: 55.7558, lng: 37.6173 };
    let cancelled = false;
    fetch(`/api/sponsored?lat=${center.lat}&lng=${center.lng}&radius=3`)
      .then(async (response) => response.json())
      .then((payload) => {
        if (!cancelled) {
          setSponsoredStops(Array.isArray(payload) ? payload : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSponsoredStops([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingStops(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [includeFoodStops, waypoints]);

  const routeFeatures = useMemo<RouteFeature[]>(() => {
    const existingRoutes = baseRoutes
      .map((route) => parseRouteGeometry(route.geometryGeoJson, { id: route.id, name: route.name, color: "#60a5fa" }))
      .filter((feature): feature is RouteFeature => Boolean(feature));

    return visibleDraftRoute ? [...existingRoutes, visibleDraftRoute] : existingRoutes;
  }, [baseRoutes, visibleDraftRoute]);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      <div className="w-80 shrink-0 overflow-y-auto border-r bg-background p-4 space-y-4">
        <h1 className="font-bold text-lg">Route Builder</h1>
        <div>
          <label className="text-sm font-medium mb-1 block">Route Name</label>
          <Input
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="My awesome route"
          />
        </div>

        <Card>
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Live Stats</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>📍 Waypoints: {waypoints.length}</p>
            <p>📏 Distance: {visibleDistanceKm > 0 ? `${visibleDistanceKm.toFixed(1)} km` : "calculating…"}</p>
            <p>⏱️ Time: {visibleDurationMin > 0 ? `${visibleDurationMin} min` : "—"}</p>
            <p>🔥 Calories: {visibleDurationMin > 0 ? `${estimateCalories({ estimatedMin: visibleDurationMin, lengthKm: visibleDistanceKm })} kcal` : "—"}</p>
          </CardContent>
        </Card>

        <RouteOptions
          includeFoodStops={includeFoodStops}
          loading={loadingStops}
          sponsoredStops={effectiveSponsoredStops}
          selectedSponsoredStopId={effectiveSelectedSponsoredStopId}
          onIncludeFoodStopsChange={(enabled) => {
            setIncludeFoodStops(enabled);
            setLoadingStops(enabled);
            if (!enabled) {
              setSelectedSponsoredStopId(null);
            }
          }}
          onSponsoredStopSelect={(stop) => setSelectedSponsoredStopId(stop.id)}
        />

        {waypoints.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Waypoints</h3>
            <div className="space-y-1">
              {waypoints.map((wp, i) => (
                <div key={`${wp.lat}-${wp.lng}-${i}`} className="flex items-center justify-between text-xs p-2 rounded border">
                  <span>{wp.name || `Point ${i + 1}`}</span>
                  <button onClick={() => setWaypoints((current) => current.filter((_, index) => index !== i))} className="text-destructive hover:underline" aria-label="Remove waypoint">×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button className="w-full" disabled={!routeName || waypoints.length < 2 || !visibleDraftRoute}>
          Publish Route
        </Button>
      </div>

      <div className="flex-1 relative">
        <MapContainer
          className="w-full h-full"
          routes={routeFeatures}
          sponsoredStops={effectiveSponsoredStops}
          onSponsoredStopSelect={(stop) => setSelectedSponsoredStopId(stop.id)}
          onRoutePointSelect={({ routeId, routeName: selectedRouteName, coordinates }) => {
            setWaypoints((current) => ([
              ...current,
              {
                lat: coordinates[1],
                lng: coordinates[0],
                name: `${selectedRouteName} · Point ${current.length + 1}`,
                routeId,
              },
            ]));
          }}
        />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur rounded-lg px-4 py-2 text-sm text-muted-foreground shadow">
          Tap a route to snap in your next waypoint.
        </div>
      </div>
    </div>
  );
}

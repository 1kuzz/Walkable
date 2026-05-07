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

export default function RouteBuilderPage() {
  const [routeName, setRouteName] = useState("");
  const [baseRoutes, setBaseRoutes] = useState<ApiRoute[]>([]);
  const [waypoints, setWaypoints] = useState<BuilderWaypoint[]>([]);
  const [draftRoute, setDraftRoute] = useState<RouteFeature | null>(null);
  const [draftDistanceKm, setDraftDistanceKm] = useState(0);
  const [draftDurationMin, setDraftDurationMin] = useState(0);
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

  const routeFeatures = useMemo<RouteFeature[]>(() => {
    const existingRoutes = baseRoutes
      .map((route) => parseRouteGeometry(route.geometryGeoJson, { id: route.id, name: route.name, color: "#60a5fa" }))
      .filter((feature): feature is RouteFeature => Boolean(feature));

    return draftRoute ? [...existingRoutes, draftRoute] : existingRoutes;
  }, [baseRoutes, draftRoute]);

  const waypointPositions = useMemo<Position[]>(() => waypoints.map((waypoint) => [waypoint.lng, waypoint.lat]), [waypoints]);

  useEffect(() => {
    if (waypointPositions.length < 2) {
      setDraftRoute(null);
      setDraftDistanceKm(0);
      setDraftDurationMin(0);
      return;
    }

    const points = [...waypointPositions];
    if (includeFoodStops && selectedSponsoredStopId) {
      const stop = sponsoredStops.find((item) => item.id === selectedSponsoredStopId);
      if (stop) {
        points.splice(1, 0, [stop.lng, stop.lat]);
      }
    }

    let cancelled = false;
    getRoute(points, routeName || "Draft route")
      .then((result) => {
        if (!cancelled) {
          setDraftRoute(
            result
              ? {
                  ...result.feature,
                  properties: {
                    ...result.feature.properties,
                    id: "draft-route",
                    color: "#f97316",
                    source: "draft",
                  },
                }
              : null,
          );
          setDraftDistanceKm(result?.distanceKm ?? 0);
          setDraftDurationMin(result?.durationMin ?? 0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDraftRoute(null);
          setDraftDistanceKm(0);
          setDraftDurationMin(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [includeFoodStops, routeName, selectedSponsoredStopId, sponsoredStops, waypointPositions]);

  useEffect(() => {
    if (!includeFoodStops) {
      setSponsoredStops([]);
      setSelectedSponsoredStopId(null);
      return;
    }

    const center = waypoints.at(-1) ?? { lat: 55.7558, lng: 37.6173 };
    let cancelled = false;
    setLoadingStops(true);
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
            <p>📏 Distance: {draftDistanceKm > 0 ? `${draftDistanceKm.toFixed(1)} km` : "calculating…"}</p>
            <p>⏱️ Time: {draftDurationMin > 0 ? `${draftDurationMin} min` : "—"}</p>
            <p>🔥 Calories: {draftDurationMin > 0 ? `${estimateCalories({ estimatedMin: draftDurationMin, lengthKm: draftDistanceKm })} kcal` : "—"}</p>
          </CardContent>
        </Card>

        <RouteOptions
          includeFoodStops={includeFoodStops}
          loading={loadingStops}
          sponsoredStops={sponsoredStops}
          selectedSponsoredStopId={selectedSponsoredStopId}
          onIncludeFoodStopsChange={setIncludeFoodStops}
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

        <Button className="w-full" disabled={!routeName || waypoints.length < 2 || !draftRoute}>
          Publish Route
        </Button>
      </div>

      <div className="flex-1 relative">
        <MapContainer
          className="w-full h-full"
          routes={routeFeatures}
          sponsoredStops={includeFoodStops ? sponsoredStops : []}
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

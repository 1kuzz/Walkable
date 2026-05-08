"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { Position } from "geojson";
import Link from "next/link";
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
  id: string;
  lat: number;
  lng: number;
  name: string;
  routeId?: string;
}

interface ApiRoute {
  id: string;
  parkId: string;
  name: string;
  geometryGeoJson?: string | null;
}

interface DraftRouteState {
  feature: RouteFeature | null;
  distanceKm: number;
  durationMin: number;
}

const DEFAULT_DRAFT_ROUTE_NAME = "Draft route";
const DEFAULT_PUBLISHED_DIFFICULTY = "easy";
const DEFAULT_PUBLISHED_SURFACE_TYPE = "mixed";
const DEFAULT_PUBLISHED_ELEVATION_GAIN = 0;
const DEFAULT_PUBLISHED_DESCRIPTION_SUFFIX = "community trail created in Walkable route builder.";

const emptyDraftRouteState: DraftRouteState = {
  feature: null,
  distanceKm: 0,
  durationMin: 0,
};

function publishButtonTitle(waypointCount: number, draftRoute: RouteFeature | null): string | undefined {
  if (waypointCount < 2) return "Add at least two points to publish this trail.";
  if (!draftRoute) return "Waiting for the route to be calculated…";
  return undefined;
}

export default function RouteBuilderPage() {
  const [routeName, setRouteName] = useState("");
  const [baseRoutes, setBaseRoutes] = useState<ApiRoute[]>([]);
  const [waypoints, setWaypoints] = useState<BuilderWaypoint[]>([]);
  const [draftRouteState, setDraftRouteState] = useState<DraftRouteState>(emptyDraftRouteState);
  const [includeFoodStops, setIncludeFoodStops] = useState(false);
  const [loadingStops, setLoadingStops] = useState(false);
  const [sponsoredStops, setSponsoredStops] = useState<SponsoredStopMapItem[]>([]);
  const [selectedSponsoredStopId, setSelectedSponsoredStopId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedRouteId, setPublishedRouteId] = useState<string | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

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
    getRoute(points, routeName || DEFAULT_DRAFT_ROUTE_NAME)
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
  const canPublishRoute = waypoints.length >= 2 && Boolean(visibleDraftRoute) && !publishing;

  const publishedRouteUrl = useMemo(() => {
    if (!publishedRouteId || typeof window === "undefined") {
      return "";
    }

    return `${window.location.origin}/routes/${publishedRouteId}`;
  }, [publishedRouteId]);

  const handlePublishRoute = async () => {
    setPublishError(null);
    setShareError(null);
    setCopiedShareLink(false);

    if (!visibleDraftRoute || waypoints.length < 2) {
      setPublishError("Add at least two points before publishing.");
      return;
    }

    const selectedParks = Array.from(
      new Set(
        waypoints
          .map((waypoint) => baseRoutes.find((route) => route.id === waypoint.routeId)?.parkId)
          .filter((parkId): parkId is string => Boolean(parkId)),
      ),
    );

    if (selectedParks.length !== 1) {
      setPublishError("Select points from routes in the same park before publishing.");
      return;
    }

    setPublishing(true);
    try {
      const normalizedRouteName = routeName.trim() || DEFAULT_DRAFT_ROUTE_NAME;
      const response = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parkId: selectedParks[0],
          name: normalizedRouteName,
          description: `${normalizedRouteName} — ${DEFAULT_PUBLISHED_DESCRIPTION_SUFFIX}`,
          difficulty: DEFAULT_PUBLISHED_DIFFICULTY,
          lengthKm: Math.round(visibleDistanceKm * 100) / 100,
          elevationGain: DEFAULT_PUBLISHED_ELEVATION_GAIN,
          surfaceType: DEFAULT_PUBLISHED_SURFACE_TYPE,
          estimatedMin: visibleDurationMin,
          geometryGeoJson: JSON.stringify(visibleDraftRoute.geometry),
          waypoints: {
            create: waypoints.map((waypoint, index) => ({
              lat: waypoint.lat,
              lng: waypoint.lng,
              name: waypoint.name || `Point ${index + 1}`,
            })),
          },
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.error === "string" ? payload.error : "Failed to publish route");
      }

      const payload = await response.json();
      if (!payload || typeof payload !== "object" || typeof (payload as { id?: unknown }).id !== "string") {
        throw new Error("Published route response was invalid");
      }
      setPublishedRouteId((payload as { id: string }).id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to publish route";
      setPublishError(message);
    } finally {
      setPublishing(false);
    }
  };

  const handleCopyShareLink = async () => {
    setShareError(null);
    if (!publishedRouteUrl) {
      setShareError("Share link is not available yet.");
      return;
    }
    if (!navigator.clipboard) {
      setShareError("Clipboard access is not available in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(publishedRouteUrl);
      setCopiedShareLink(true);
    } catch {
      setShareError("Could not copy the link. Please copy it manually.");
    }
  };

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
                <div key={wp.id} className="flex items-center justify-between text-xs p-2 rounded border">
                  <span className="truncate mr-2">{wp.name || `Point ${i + 1}`}</span>
                  <button
                    onClick={() => setWaypoints((current) => current.filter((_, index) => index !== i))}
                    className="shrink-0 flex items-center justify-center min-w-[36px] min-h-[36px] rounded text-destructive hover:bg-destructive/10 active:scale-95 transition-all"
                    aria-label={`Remove waypoint ${i + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button
          className="w-full"
          disabled={!canPublishRoute}
          title={publishButtonTitle(waypoints.length, visibleDraftRoute)}
          onClick={handlePublishRoute}
        >
          {publishing ? "Publishing..." : "Publish Route"}
        </Button>
        {publishError && <p className="text-sm text-destructive">{publishError}</p>}
        {publishedRouteId && (
          <Card>
            <CardHeader className="py-2">
              <CardTitle className="text-sm">Trail published 🎉</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Your trail is now public and can be shared with everyone.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" asChild>
                  <Link href={`/routes/${publishedRouteId}`}>Open trail</Link>
                </Button>
                <Button size="sm" variant="outline" onClick={handleCopyShareLink}>
                  {copiedShareLink ? "Link copied" : "Copy share link"}
                </Button>
              </div>
              <p className="sr-only" aria-live="polite">{copiedShareLink ? "Share link copied to clipboard." : ""}</p>
            </CardContent>
          </Card>
        )}
        {shareError && <p className="text-sm text-destructive">{shareError}</p>}
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
                id: crypto.randomUUID(),
                lat: coordinates[1],
                lng: coordinates[0],
                name: `${selectedRouteName} · Point ${current.length + 1}`,
                routeId,
              },
            ]));
          }}
        />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur rounded-lg px-4 py-2 text-sm text-muted-foreground shadow">
          Tap or click a route to snap in your next waypoint.
        </div>
      </div>
    </div>
  );
}

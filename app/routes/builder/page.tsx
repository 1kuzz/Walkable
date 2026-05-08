"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
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
  park?: { name?: string };
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
const MAX_WAYPOINTS = 50;
const WAYPOINT_DUPLICATE_PRECISION = 6;

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
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [draftStatus, setDraftStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [selectedParkId, setSelectedParkId] = useState<string>("");
  const draftRequestIdRef = useRef(0);

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
    const requestId = ++draftRequestIdRef.current;
    queueMicrotask(() => {
      if (!cancelled && requestId === draftRequestIdRef.current) {
        setDraftStatus("loading");
      }
    });
    getRoute(points, routeName || DEFAULT_DRAFT_ROUTE_NAME)
      .then((result) => {
        if (!cancelled && requestId === draftRequestIdRef.current) {
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
          setDraftStatus(result ? "ready" : "error");
        }
      })
      .catch(() => {
        if (!cancelled && requestId === draftRequestIdRef.current) {
          setDraftRouteState(emptyDraftRouteState);
          setDraftStatus("error");
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
  const hasValidDraftGeometry = Boolean(
    visibleDraftRoute
      && visibleDraftRoute.geometry.type === "LineString"
      && visibleDraftRoute.geometry.coordinates.length >= 2,
  );
  const canPublishRoute = waypoints.length >= 2
    && hasValidDraftGeometry
    && draftStatus === "ready"
    && !publishing;
  const visibleDraftStatus = waypointPositions.length < 2 ? "idle" : draftStatus;
  const waypointMarkers = useMemo(
    () =>
      waypoints.map((waypoint, index) => ({
        id: waypoint.id,
        lat: waypoint.lat,
        lng: waypoint.lng,
        label: `${index + 1}`,
      })),
    [waypoints],
  );
  const parkOptions = useMemo(() => {
    const parkMap = new Map<string, string>();
    baseRoutes.forEach((route) => {
      if (!parkMap.has(route.parkId)) {
        parkMap.set(route.parkId, route.park?.name?.trim() || `Park ${route.parkId.slice(0, 6)}`);
      }
    });
    return Array.from(parkMap.entries()).map(([id, name]) => ({ id, name }));
  }, [baseRoutes]);

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
    if (waypoints.length > MAX_WAYPOINTS) {
      setPublishError(`Waypoints are limited to ${MAX_WAYPOINTS}.`);
      return;
    }
    if (hasDuplicateWaypoints(waypoints)) {
      setPublishError("Waypoint list contains duplicate points. Remove duplicates before publishing.");
      return;
    }
    if (!hasValidDraftGeometry) {
      setPublishError("Draft route geometry is invalid. Adjust waypoints and try again.");
      return;
    }
    if (visibleDraftStatus === "loading") {
      setPublishError("Route is still being calculated. Please wait.");
      return;
    }

    const selectedParks = Array.from(
      new Set(
        waypoints
          .map((waypoint) => baseRoutes.find((route) => route.id === waypoint.routeId)?.parkId)
          .filter((parkId): parkId is string => Boolean(parkId)),
      ),
    );
    const resolvedParkId = selectedParks.length === 1
      ? selectedParks[0]
      : (selectedParkId || null);
    if (!resolvedParkId) {
      setPublishError("Choose a park before publishing.");
      return;
    }
    if (selectedParks.length > 1) {
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
          parkId: resolvedParkId,
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

  const addWaypoint = (waypoint: Omit<BuilderWaypoint, "id">) => {
    setWaypoints((current) => {
      if (current.length >= MAX_WAYPOINTS) {
        return current;
      }
      const incomingKey = formatWaypointKey(waypoint.lat, waypoint.lng);
      if (current.some((item) => formatWaypointKey(item.lat, item.lng) === incomingKey)) {
        return current;
      }
      return [
        ...current,
        {
          ...waypoint,
          id: crypto.randomUUID(),
        },
      ];
    });
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
            <p>🧭 Draft: {visibleDraftStatus === "idle" ? "add 2+ points" : visibleDraftStatus}</p>
          </CardContent>
        </Card>
        <div>
          <label className="text-sm font-medium mb-1 block">Park for publication</label>
          <select
            value={selectedParkId}
            onChange={(event) => setSelectedParkId(event.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">Auto-detect from selected route points</option>
            {parkOptions.map((park) => (
              <option key={park.id} value={park.id}>{park.name}</option>
            ))}
          </select>
        </div>

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
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Waypoints</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWaypoints([])}
              >
                Clear all
              </Button>
            </div>
            <div className="space-y-1">
              {waypoints.map((wp, i) => (
                <div key={wp.id} className="flex items-center justify-between text-xs p-2 rounded border">
                  <div className="mr-2 flex-1 space-y-1">
                    <p className="text-[11px] text-muted-foreground">#{i + 1}</p>
                    <Input
                      value={wp.name}
                      onChange={(event) => {
                        const value = event.target.value;
                        setWaypoints((current) => current.map((item, index) => (index === i ? { ...item, name: value } : item)));
                      }}
                      className="h-8 text-xs"
                      placeholder={`Point ${i + 1}`}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={i === 0}
                      onClick={() => {
                        setWaypoints((current) => {
                          if (i === 0) return current;
                          const reordered = [...current];
                          [reordered[i - 1], reordered[i]] = [reordered[i], reordered[i - 1]];
                          return reordered;
                        });
                      }}
                      aria-label={`Move waypoint ${i + 1} up`}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={i === waypoints.length - 1}
                      onClick={() => {
                        setWaypoints((current) => {
                          if (i === current.length - 1) return current;
                          const reordered = [...current];
                          [reordered[i + 1], reordered[i]] = [reordered[i], reordered[i + 1]];
                          return reordered;
                        });
                      }}
                      aria-label={`Move waypoint ${i + 1} down`}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setWaypoints((current) => current.filter((_, index) => index !== i))}
                      className="text-destructive hover:text-destructive"
                      aria-label={`Remove waypoint ${i + 1}`}
                    >
                      ×
                    </Button>
                  </div>
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
        {mapStatus === "loading" && (
          <div className="absolute left-4 right-4 top-4 z-20 rounded-lg border bg-background/95 p-3 text-sm text-muted-foreground shadow">
            Loading map…
          </div>
        )}
        {mapStatus === "error" && (
          <div className="absolute left-4 right-4 top-4 z-20 rounded-lg border border-destructive/40 bg-background/95 p-3 text-sm text-destructive shadow">
            Map is unavailable. Verify your Yandex Maps API key and network connection.
          </div>
        )}
          <MapContainer
            className="w-full h-full"
            routes={routeFeatures}
            sponsoredStops={effectiveSponsoredStops}
            waypoints={waypointMarkers}
            onMapStatusChange={setMapStatus}
            onMapPointSelect={(coordinates) => {
              addWaypoint({
                lat: coordinates[1],
                lng: coordinates[0],
                name: `Point ${waypoints.length + 1}`,
              });
            }}
            onSponsoredStopSelect={(stop) => setSelectedSponsoredStopId(stop.id)}
            onRoutePointSelect={({ routeId, routeName: selectedRouteName, coordinates }) => {
              addWaypoint({
                lat: coordinates[1],
                lng: coordinates[0],
                name: `${selectedRouteName} · Point ${waypoints.length + 1}`,
                routeId,
              });
            }}
          />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur rounded-lg px-4 py-2 text-sm text-muted-foreground shadow">
          Tap or click a route to snap a waypoint, or tap or click anywhere on the map to place one manually.
        </div>
      </div>
    </div>
  );
}

function hasDuplicateWaypoints(waypoints: Array<{ lat: number; lng: number }>): boolean {
  const seen = new Set<string>();
  for (const waypoint of waypoints) {
    const key = formatWaypointKey(waypoint.lat, waypoint.lng);
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  return false;
}

function formatWaypointKey(lat: number, lng: number): string {
  return `${lat.toFixed(WAYPOINT_DUPLICATE_PRECISION)},${lng.toFixed(WAYPOINT_DUPLICATE_PRECISION)}`;
}

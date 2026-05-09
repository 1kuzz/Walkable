"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Position } from "geojson";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import RouteOptions from "@/components/routes/RouteOptions";
import ParkWaypointPicker from "@/components/routes/ParkWaypointPicker";
import { estimateCalories } from "@/lib/calories";
import { parseRouteGeometry, type RouteFeature, type SponsoredStopMapItem } from "@/lib/geo";
import { createHoverPreviewResetKey } from "@/lib/routes/hover-preview";
import type { PathwayDiagnostics } from "@/components/map/MapContainer";
import {
  getRoutingFallbackMessage,
  ROUTE_PREFERENCES,
  type GetRouteOptions,
  type RoutePreference,
  type RoutingDiagnostics,
  type TransportMode,
} from "@/lib/routing";
import { getRouteFromApi } from "@/lib/routing-client";
import { isSignificantSnap, snapToNearestRoad, snapToNearestWalkway } from "@/lib/snap-to-walkway";
import {
  WALKABLE_FOOTPATH_COLOR,
  WALKABLE_ROAD_CASING_COLOR,
  WALKABLE_ROAD_RIVER_COLOR,
} from "@/lib/maplibre";

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
const PARK_ID_PREFIX_LENGTH = 6;
// ~55 m at mid-latitudes — skip preview when cursor is virtually on top of the waypoint.
const HOVER_PREVIEW_MIN_DISTANCE_DEGREES = 0.0005;
const HOVER_PREVIEW_DEBOUNCE_MS = 120;

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
  const initialSearchParams = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return new URLSearchParams(window.location.search);
  }, []);
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
  const [transportMode, setTransportMode] = useState<TransportMode>("foot");
  const [routePreference, setRoutePreference] = useState<RoutePreference>("park");
  const [snapToRoutes, setSnapToRoutes] = useState(false);
  const [snapIndicator, setSnapIndicator] = useState<"path" | "road" | "manual" | null>(null);
  const [snappingWaypoint, setSnappingWaypoint] = useState(false);
  const [draftRoutingDiagnostics, setDraftRoutingDiagnostics] = useState<RoutingDiagnostics | null>(null);
  const [hoverRoutingDiagnostics, setHoverRoutingDiagnostics] = useState<RoutingDiagnostics | null>(null);
  const [pathwayDiagnostics, setPathwayDiagnostics] = useState<PathwayDiagnostics | null>(null);
  const draftRequestIdRef = useRef(0);
  const [hoverPreviewRoute, setHoverPreviewRoute] = useState<RouteFeature | null>(null);
  const hoverDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverRequestIdRef = useRef(0);

  // Cancel any pending hover debounce on unmount.
  useEffect(() => {
    return () => {
      if (hoverDebounceTimerRef.current !== null) {
        clearTimeout(hoverDebounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/routes?sort=popular", {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then(async (response) => response.json())
      .then((payload) => setBaseRoutes(Array.isArray(payload) ? payload : []))
      .catch(() => {
        if (!controller.signal.aborted) {
          setBaseRoutes([]);
        }
      });

    return () => {
      controller.abort();
    };
  }, []);

  const waypointPositions = useMemo<Position[]>(() => waypoints.map((waypoint) => [waypoint.lng, waypoint.lat]), [waypoints]);
  const knownRouteGeometries = useMemo<NonNullable<GetRouteOptions["knownRouteGeometries"]>>(
    () => Object.fromEntries(
      baseRoutes
        .map((route) => parseRouteGeometry(route.geometryGeoJson, { id: route.id, name: route.name }))
        .filter((feature): feature is RouteFeature => {
          if (!feature) {
            return false;
          }
          return feature.geometry.coordinates.length >= 2;
        })
        .map((feature) => [feature.properties.id, feature.geometry.coordinates] as const),
    ),
    [baseRoutes],
  );
  const effectiveRoutePreference = transportMode === "foot" ? routePreference : "foot";
  const hoverPreviewResetKey = useMemo(
    () => createHoverPreviewResetKey(waypointPositions, effectiveRoutePreference),
    [waypointPositions, effectiveRoutePreference],
  );
  const selectedRoutePreferenceLabel = useMemo(
    () => ROUTE_PREFERENCES.find((item) => item.value === effectiveRoutePreference)?.label ?? effectiveRoutePreference,
    [effectiveRoutePreference],
  );

  useEffect(() => {
    if (hoverDebounceTimerRef.current !== null) {
      clearTimeout(hoverDebounceTimerRef.current);
      hoverDebounceTimerRef.current = null;
    }
    hoverRequestIdRef.current += 1;
    queueMicrotask(() => {
      setHoverPreviewRoute(null);
      setHoverRoutingDiagnostics(null);
    });
  }, [hoverPreviewResetKey, transportMode]);

  useEffect(() => {
    if (!initialSearchParams) {
      return;
    }
    const preselectedParkId = initialSearchParams.get("parkId");
    const startLat = Number(initialSearchParams.get("startLat"));
    const startLng = Number(initialSearchParams.get("startLng"));
    const startName = initialSearchParams.get("startName")?.trim();
    if (preselectedParkId) {
      queueMicrotask(() => setSelectedParkId(preselectedParkId));
    }
    if (Number.isFinite(startLat) && Number.isFinite(startLng)) {
      queueMicrotask(() => {
        setWaypoints((current) => {
          if (current.length > 0) {
            return current;
          }
          return [{
            id: crypto.randomUUID(),
            lat: startLat,
            lng: startLng,
            name: startName || "Start point",
          }];
        });
      });
    }
  }, [initialSearchParams]);

  useEffect(() => {
    if (!snapIndicator) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setSnapIndicator(null);
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [snapIndicator]);

  const effectiveSponsoredStops = includeFoodStops ? sponsoredStops : [];
  const effectiveSelectedSponsoredStopId = includeFoodStops ? selectedSponsoredStopId : null;
  const visibleDraftRoute = waypointPositions.length >= 2 ? draftRouteState.feature : null;
  const visibleDistanceKm = waypointPositions.length >= 2 ? draftRouteState.distanceKm : 0;
  const visibleDurationMin = waypointPositions.length >= 2 ? draftRouteState.durationMin : 0;

  useEffect(() => {
    if (waypointPositions.length < 2) {
      return;
    }

    const routingWaypoints: Array<{ position: Position; routeId?: string }> = waypoints.map((waypoint) => ({
      position: [waypoint.lng, waypoint.lat] as Position,
      routeId: waypoint.routeId,
    }));
    if (effectiveSelectedSponsoredStopId) {
      const stop = sponsoredStops.find((item) => item.id === effectiveSelectedSponsoredStopId);
      if (stop) {
        routingWaypoints.splice(1, 0, { position: [stop.lng, stop.lat], routeId: undefined });
      }
    }

    let cancelled = false;
    const requestId = ++draftRequestIdRef.current;
    queueMicrotask(() => {
      if (!cancelled && requestId === draftRequestIdRef.current) {
        setDraftStatus("loading");
      }
    });
    getRouteFromApi(
      routingWaypoints.map((item) => item.position),
      routeName || DEFAULT_DRAFT_ROUTE_NAME,
      effectiveRoutePreference,
      transportMode,
      {
        waypointHints: routingWaypoints.map((item) => ({ routeId: item.routeId })),
        knownRouteGeometries,
      },
    )
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
                      routingPreference: result.routing.preference,
                      routingQuality: result.routing.quality,
                    },
                  },
                  distanceKm: result.distanceKm,
                  durationMin: result.durationMin,
                }
              : emptyDraftRouteState,
          );
          setDraftRoutingDiagnostics(result?.routing ?? null);
          setDraftStatus(result ? "ready" : "error");
        }
      })
      .catch(() => {
        if (!cancelled && requestId === draftRequestIdRef.current) {
          setDraftRouteState(emptyDraftRouteState);
          setDraftRoutingDiagnostics(null);
          setDraftStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveRoutePreference, effectiveSelectedSponsoredStopId, knownRouteGeometries, routeName, sponsoredStops, transportMode, waypointPositions, waypoints]);

  useEffect(() => {
    if (!includeFoodStops) {
      return;
    }

    const center = waypoints.at(-1) ?? { lat: 55.7558, lng: 37.6173 };
    const controller = new AbortController();
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoadingStops(true);
      }
    });
    fetch(`/api/sponsored?lat=${center.lat}&lng=${center.lng}&radius=3`, {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then(async (response) => response.json())
      .then((payload) => {
        if (!cancelled) {
          setSponsoredStops(Array.isArray(payload) ? payload : []);
        }
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) {
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
      controller.abort();
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
  const routingDiagnostics = waypointPositions.length < 2 ? null : (draftRoutingDiagnostics ?? hoverRoutingDiagnostics);
  const routingFallbackMessage = getRoutingFallbackMessage(routingDiagnostics);
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
        parkMap.set(route.parkId, route.park?.name?.trim() || `Park ${route.parkId.slice(0, PARK_ID_PREFIX_LENGTH)}`);
      }
    });
    return Array.from(parkMap.entries()).map(([id, name]) => ({ id, name }));
  }, [baseRoutes]);

  const moveWaypoint = (fromIndex: number, toIndex: number) => {
    setWaypoints((current) => swapArrayItems(current, fromIndex, toIndex));
  };

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
            transportMode,
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

  const addWaypoint = useCallback((waypoint: Omit<BuilderWaypoint, "id">) => {
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
  }, []);

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

  const handleMapPointSelect = useCallback(async (coordinates: Position) => {
    setHoverPreviewRoute(null);
    setSnappingWaypoint(true);
    try {
      const snappedCoordinates = transportMode === "foot"
        ? await snapToNearestWalkway(coordinates)
        : await snapToNearestRoad(coordinates);
      if (isSignificantSnap(coordinates, snappedCoordinates)) {
        setSnapIndicator(transportMode === "foot" ? "path" : "road");
      } else {
        setSnapIndicator("manual");
      }
      addWaypoint({
        lat: snappedCoordinates[1],
        lng: snappedCoordinates[0],
        name: `Point ${waypoints.length + 1}`,
      });
    } finally {
      setSnappingWaypoint(false);
    }
  }, [addWaypoint, transportMode, waypoints.length]);

  const handleRoutePointSelect = useCallback(async ({ routeId, routeName: selectedRouteName, coordinates }: { routeId: string; routeName: string; coordinates: Position }) => {
    setHoverPreviewRoute(null);
    setSnappingWaypoint(true);
    try {
      const snappedCoordinates = transportMode === "foot"
        ? await snapToNearestWalkway(coordinates)
        : await snapToNearestRoad(coordinates);
      if (isSignificantSnap(coordinates, snappedCoordinates)) {
        setSnapIndicator(transportMode === "foot" ? "path" : "road");
      } else {
        setSnapIndicator("manual");
      }
      addWaypoint({
        lat: snappedCoordinates[1],
        lng: snappedCoordinates[0],
        name: `${selectedRouteName} · Point ${waypoints.length + 1}`,
        routeId,
      });
    } finally {
      setSnappingWaypoint(false);
    }
  }, [addWaypoint, transportMode, waypoints.length]);

  const handleSponsoredStopSelect = useCallback((stop: SponsoredStopMapItem) => {
    setSelectedSponsoredStopId(stop.id);
  }, []);

  /**
   * Fires on every map mousemove (desktop).
   * Debounces by 120 ms and fetches a walking preview from the last placed
   * waypoint to the cursor position, rendered as a dashed green ghost line.
   */
  const handleMapHover = useCallback((coordinates: Position) => {
    if (waypoints.length === 0) {
      setHoverRoutingDiagnostics(null);
      return;
    }

    const lastWaypoint = waypoints[waypoints.length - 1];
    const from: Position = [lastWaypoint.lng, lastWaypoint.lat];

    // Skip if cursor is very close to the last waypoint (no meaningful preview).
    if (Math.abs(from[0] - coordinates[0]) < HOVER_PREVIEW_MIN_DISTANCE_DEGREES && Math.abs(from[1] - coordinates[1]) < HOVER_PREVIEW_MIN_DISTANCE_DEGREES) {
      setHoverPreviewRoute(null);
      setHoverRoutingDiagnostics(null);
      return;
    }

    if (hoverDebounceTimerRef.current !== null) {
      clearTimeout(hoverDebounceTimerRef.current);
    }

    const requestId = ++hoverRequestIdRef.current;
    hoverDebounceTimerRef.current = setTimeout(() => {
      hoverDebounceTimerRef.current = null;
      getRouteFromApi([from, coordinates], "Preview", effectiveRoutePreference, transportMode, {
        waypointHints: [{ routeId: lastWaypoint.routeId }, {}],
        knownRouteGeometries,
      })
        .then((result) => {
          if (requestId !== hoverRequestIdRef.current || !result) {
            return;
          }
          setHoverRoutingDiagnostics(result.routing);
          setHoverPreviewRoute({
            ...result.feature,
            properties: {
              ...result.feature.properties,
              id: "hover-preview",
              color: "#22c55e",
              source: "hover-preview",
              routingPreference: result.routing.preference,
              routingQuality: result.routing.quality,
            },
          });
        })
        .catch(() => {
          setHoverRoutingDiagnostics(null);
          // Silently ignore preview routing errors.
        });
    }, HOVER_PREVIEW_DEBOUNCE_MS);
  }, [effectiveRoutePreference, knownRouteGeometries, transportMode, waypoints]);

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
          <label className="text-sm font-medium mb-1 block">Transport mode</label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={transportMode === "car" ? "default" : "outline"}
              size="sm"
              onClick={() => setTransportMode("car")}
            >
              🚗 Drive
            </Button>
            <Button
              type="button"
              variant={transportMode === "foot" ? "default" : "outline"}
              size="sm"
              onClick={() => setTransportMode("foot")}
            >
              🚶 Walk
            </Button>
          </div>
        </div>
        {transportMode === "foot" && (
          <div>
            <label className="text-sm font-medium mb-1 block">Route preference</label>
            <select
              value={routePreference}
              onChange={(event) => setRoutePreference(event.target.value as RoutePreference)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {ROUTE_PREFERENCES.map((pref) => (
                <option key={pref.value} value={pref.value}>{pref.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              “Walkable streets only” uses specialized routing and can automatically fall back to park-aware routing in areas with limited walkable infrastructure data.
            </p>
          </div>
        )}
        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={snapToRoutes}
            onChange={(event) => setSnapToRoutes(event.target.checked)}
            className="h-4 w-4"
          />
          Snap to community routes
        </label>

        <Card>
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Routing status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            <p>
              <span className="font-medium">Mode:</span>{" "}
              {transportMode === "car" ? "Drive" : `Walk · ${selectedRoutePreferenceLabel}`}
            </p>
            <p>
              <span className="font-medium">Provider:</span>{" "}
              {routingDiagnostics
                ? routingDiagnostics.provider === "ors"
                  ? `OpenRouteService (${routingDiagnostics.profile})`
                  : routingDiagnostics.provider === "osrm"
                    ? `OSRM (${routingDiagnostics.profile})`
                    : routingDiagnostics.provider === "community"
                      ? `Community path geometry (${routingDiagnostics.profile})`
                      : `Hybrid community + network (${routingDiagnostics.profile})`
                : "Waiting for route update…"}
            </p>
            {routingFallbackMessage && (
              <p className="text-amber-600 dark:text-amber-400">
                {routingFallbackMessage}
              </p>
            )}
            <p className="text-muted-foreground">
              <span className="font-medium">Pathway visibility:</span> {describePathwayDiagnostics(pathwayDiagnostics)}
            </p>
            {waypoints.length > 0 && (
              <p className="text-muted-foreground">
                Dashed green line is hover preview only; the orange line is your draft route.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Line guide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            <p className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-6 rounded" style={{ background: "#f97316" }} />
              Draft walking route
            </p>
            <p className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-6 border-t-2 border-dashed" style={{ borderColor: "#22c55e" }} />
              Hover preview (next segment)
            </p>
            <p className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-6 rounded opacity-60" style={{ background: "#60a5fa" }} />
              Community route reference
            </p>
            <p className="flex items-center gap-2">
              <span
                className="inline-block h-0.5 w-6 rounded"
                style={{ background: WALKABLE_ROAD_RIVER_COLOR, boxShadow: `0 0 0 1px ${WALKABLE_ROAD_CASING_COLOR}` }}
              />
              Blue rivers = car roads
            </p>
            <p className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-6 border-t-2 border-dashed" style={{ borderColor: WALKABLE_FOOTPATH_COLOR }} />
              Cream dashed = walkable paths
            </p>
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

        <ParkWaypointPicker
          centerLat={waypoints.at(-1)?.lat ?? 55.7558}
          centerLng={waypoints.at(-1)?.lng ?? 37.6173}
          onAddPark={(park) => addWaypoint({ lat: park.lat, lng: park.lng, name: park.name })}
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
                        moveWaypoint(i, i - 1);
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
                        moveWaypoint(i, i + 1);
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
            Map is unavailable. Verify your network connection and external tile/routing availability.
          </div>
        )}
          <MapContainer
            className="w-full h-full"
            routes={routeFeatures}
            sponsoredStops={effectiveSponsoredStops}
            waypoints={waypointMarkers}
            previewRoute={waypoints.length > 0 ? hoverPreviewRoute : null}
            routeVisualMode="builder"
            styleModeOverride={transportMode === "foot" && effectiveRoutePreference === "walkable" ? "walkable" : undefined}
            enableRouteSnapping={snapToRoutes}
            onMapStatusChange={setMapStatus}
            onPathwayDiagnosticsChange={setPathwayDiagnostics}
            onMapHover={handleMapHover}
            onMapPointSelect={handleMapPointSelect}
            onSponsoredStopSelect={handleSponsoredStopSelect}
            onRoutePointSelect={handleRoutePointSelect}
          />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur rounded-lg px-4 py-2 text-sm text-muted-foreground shadow">
          {snapToRoutes
            ? "Tap or click a community route to snap a waypoint, or tap/click the map for manual placement."
            : "Tap or click the map to place waypoints. Enable “Snap to community routes” to snap onto existing routes."}
        </div>
        {snapIndicator && (
          <div className="absolute top-4 right-4 rounded-full border bg-background/95 px-3 py-1 text-xs shadow">
            {snapIndicator === "path" ? "Snapped to path" : snapIndicator === "road" ? "Snapped to road" : "Placed without snap"}
          </div>
        )}
        {snappingWaypoint && (
          <div className="absolute top-14 right-4 rounded-full border bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow">
            Snapping waypoint…
          </div>
        )}
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

function swapArrayItems<T>(input: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= input.length || toIndex >= input.length) {
    return input;
  }

  const next = [...input];
  [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
  return next;
}

function describePathwayDiagnostics(diagnostics: PathwayDiagnostics | null): string {
  if (!diagnostics) {
    return "Waiting for map diagnostics…";
  }
  if (diagnostics.status === "satellite_mode") {
    return "Satellite view hides vector pathway overlays; switch to Vector or Walkable to inspect path data.";
  }
  if (diagnostics.status === "source_loading") {
    return "Vector pathway data is still loading for this viewport.";
  }
  if (diagnostics.status === "layer_missing") {
    return "Pathway layer is unavailable in the current style.";
  }
  if (diagnostics.status === "no_visible_paths") {
    return "No pedestrian vector pathways are visible in this area or at this zoom level.";
  }
  return `${diagnostics.visiblePathFeatureCount} pedestrian vector pathway segments are visible in the current viewport.`;
}

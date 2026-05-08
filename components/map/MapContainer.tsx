"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState } from "react";
import type { Position } from "geojson";
import maplibregl, {
  type MapLayerMouseEvent,
  type MapMouseEvent,
  type Marker,
} from "maplibre-gl";
import { nearestPointOnRoute, type RouteFeature, type SponsoredStopMapItem } from "@/lib/geo";
import { createSatelliteStyle, createWalkableStyle, type Map as MapLibreMap, type MapStyleMode } from "@/lib/maplibre";
import { cn } from "@/lib/utils";

interface MapContainerProps {
  lat?: number;
  lng?: number;
  zoom?: number;
  className?: string;
  routes?: RouteFeature[];
  sponsoredStops?: SponsoredStopMapItem[];
  waypoints?: Array<{ id: string; lat: number; lng: number; label?: string }>;
  onMapLoad?: (map: MapLibreMap) => void;
  onMapStatusChange?: (status: "loading" | "ready" | "error") => void;
  onMapPointSelect?: (coordinates: Position) => void;
  onRoutePointSelect?: (selection: { routeId: string; routeName: string; coordinates: Position }) => void;
  onSponsoredStopSelect?: (stop: SponsoredStopMapItem) => void;
}

const BASE_ROUTE_STYLE = {
  strokeColor: "#2563eb",
  strokeOpacity: 0.8,
  strokeWidth: 7,
  casingWidth: 14,
  casingOpacity: 0.25,
  highlightColor: "#bfdbfe",
  highlightOpacity: 0.9,
  highlightWidth: 2,
};
const ACTIVE_ROUTE_STYLE = {
  strokeColor: "#f97316",
  strokeOpacity: 0.95,
  strokeWidth: 9,
  casingWidth: 16,
};
const HOVER_POINT_COLOR = "#facc15";
const SELECTED_POINT_COLOR = "#f97316";
const FLY_TO_DURATION_MS = 400;
const FIT_BOUNDS_DURATION_MS = 600;
const DUPLICATE_EVENT_WINDOW_MS = 400;
const POSITION_PROXIMITY_EPSILON_DEGREES = 0.000001;

interface RouteLayerState {
  feature: RouteFeature;
  sourceId: string;
  casingLayerId: string;
  bodyLayerId: string;
  highlightLayerId: string;
  handleMouseEnter: (event: MapLayerMouseEvent) => void;
  handleMouseMove: (event: MapLayerMouseEvent) => void;
  handleMouseLeave: () => void;
  handleClick: (event: MapLayerMouseEvent) => void;
}

export default function MapContainer({
  lat = 55.7558,
  lng = 37.6173,
  zoom = 11,
  className = "w-full h-full",
  routes = [],
  sponsoredStops = [],
  waypoints = [],
  onMapLoad,
  onMapStatusChange,
  onMapPointSelect,
  onRoutePointSelect,
  onSponsoredStopSelect,
}: MapContainerProps) {
  const initialViewRef = useRef({ lat, lng, zoom });
  const mapRef = useRef<MapLibreMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [styleMode, setStyleMode] = useState<MapStyleMode>("walkable");
  const styleModeRef = useRef<MapStyleMode>("walkable");
  const routeLayersRef = useRef<RouteLayerState[]>([]);
  const waypointMarkersRef = useRef<Map<string, { marker: Marker; label: HTMLSpanElement }>>(new Map());
  const sponsoredStopMarkersRef = useRef<Marker[]>([]);
  const selectedRouteIdRef = useRef<string | null>(null);
  const hoverPointRef = useRef<{ marker: Marker; element: HTMLDivElement } | null>(null);
  const selectedPointRef = useRef<{ marker: Marker; element: HTMLDivElement } | null>(null);
  const lastRouteSelectionRef = useRef<{ position: Position; timestamp: number } | null>(null);
  const lastMapSelectionRef = useRef<{ position: Position; timestamp: number } | null>(null);

  useEffect(() => {
    const containerElement = containerRef.current;
    if (!containerElement) {
      return;
    }

    onMapStatusChange?.("loading");

    const initialView = initialViewRef.current;
    const waypointMarkers = waypointMarkersRef.current;
    const map = new maplibregl.Map({
      container: containerElement,
      style: createWalkableStyle(),
      center: [initialView.lng, initialView.lat],
      zoom: initialView.zoom,
    });
    let cancelled = false;
    let resizeFrameId: number | null = null;
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
        if (cancelled) {
          return;
        }
        if (resizeFrameId !== null) {
          cancelAnimationFrame(resizeFrameId);
        }
        resizeFrameId = requestAnimationFrame(() => {
          if (cancelled) {
            return;
          }
          resizeFrameId = null;
          map.resize();
        });
      });

    const handleLoad = () => {
      if (cancelled) {
        return;
      }

      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(
        new maplibregl.GeolocateControl({
          trackUserLocation: false,
        }),
        "top-right",
      );

      const hoverPoint = createPointMarker(HOVER_POINT_COLOR);
      hoverPoint.marker.setLngLat([initialView.lng, initialView.lat]).addTo(map);
      const selectedPoint = createPointMarker(SELECTED_POINT_COLOR);
      selectedPoint.marker.setLngLat([initialView.lng, initialView.lat]).addTo(map);
      hoverPointRef.current = hoverPoint;
      selectedPointRef.current = selectedPoint;
      updatePointMarker(hoverPointRef.current, null);
      updatePointMarker(selectedPointRef.current, null);

      setMapReady(true);
      map.resize();
      onMapStatusChange?.("ready");
      onMapLoad?.(map);
    };

    const handleError = () => {
      if (!cancelled) {
        onMapStatusChange?.("error");
      }
    };

    map.on("load", handleLoad);
    map.on("error", handleError);
    resizeObserver?.observe(containerElement);

    return () => {
      cancelled = true;
      setMapReady(false);
      if (resizeFrameId !== null) {
        cancelAnimationFrame(resizeFrameId);
      }
      resizeObserver?.disconnect();
      cleanupRoutes(map, routeLayersRef.current);
      routeLayersRef.current = [];
      waypointMarkers.clear();
      sponsoredStopMarkersRef.current = [];
      hoverPointRef.current?.marker.remove();
      selectedPointRef.current?.marker.remove();
      hoverPointRef.current = null;
      selectedPointRef.current = null;
      selectedRouteIdRef.current = null;
      lastRouteSelectionRef.current = null;
      lastMapSelectionRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [onMapLoad, onMapStatusChange]);

  // Style-toggle effect: runs when styleMode changes after initial mount.
  // Sets mapReady false → switches style → re-sets mapReady true so all
  // route/waypoint effects naturally re-run on the fresh style.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      // Map hasn't loaded yet; the initial style is set in the init effect.
      styleModeRef.current = styleMode;
      return;
    }
    if (styleModeRef.current === styleMode) {
      return;
    }
    styleModeRef.current = styleMode;
    setMapReady(false);
    map.setStyle(styleMode === "walkable" ? createWalkableStyle() : createSatelliteStyle());
    map.once("styledata", () => {
      if (mapRef.current) {
        setMapReady(true);
      }
    });
  }, [styleMode]);

  useEffect(() => {
    const map = mapRef.current;
    const hasWaypointFocus = waypoints.length > 0;
    if (!map || !mapReady || hasWaypointFocus) {
      return;
    }

    map.flyTo({ center: [lng, lat], zoom, duration: FLY_TO_DURATION_MS });
  }, [lat, lng, zoom, mapReady, waypoints.length]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    cleanupRoutes(map, routeLayersRef.current);

    const routeLayers: RouteLayerState[] = routes.map((route, index) => {
      const routeId = sanitizeLayerId(route.properties.id || `route-${index}`);
      const sourceId = `${routeId}-${index}-source`;
      const casingLayerId = `${routeId}-${index}-casing`;
      const bodyLayerId = `${routeId}-${index}-body`;
      const highlightLayerId = `${routeId}-${index}-highlight`;

      map.addSource(sourceId, {
        type: "geojson",
        data: route,
      });

      map.addLayer({
        id: casingLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": route.properties.color ?? BASE_ROUTE_STYLE.strokeColor,
          "line-opacity": BASE_ROUTE_STYLE.casingOpacity,
          "line-width": BASE_ROUTE_STYLE.casingWidth,
          "line-blur": 6,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });

      map.addLayer({
        id: bodyLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": route.properties.color ?? BASE_ROUTE_STYLE.strokeColor,
          "line-opacity": BASE_ROUTE_STYLE.strokeOpacity,
          "line-width": BASE_ROUTE_STYLE.strokeWidth,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });

      map.addLayer({
        id: highlightLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": BASE_ROUTE_STYLE.highlightColor,
          "line-opacity": BASE_ROUTE_STYLE.highlightOpacity,
          "line-width": BASE_ROUTE_STYLE.highlightWidth,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });

      const updateSelection = (event: MapLayerMouseEvent, callback: (position: Position) => void) => {
        const snapped = nearestPointOnRoute(route, [event.lngLat.lng, event.lngLat.lat]);
        callback(snapped.coordinates);
      };

      const handleMouseEnter = (event: MapLayerMouseEvent) => {
        if (containerRef.current) {
          containerRef.current.style.cursor = "pointer";
        }
        updateSelection(event, (coordinates) => {
          updatePointMarker(hoverPointRef.current, coordinates);
          applyRouteStyles(map, routeLayersRef.current, selectedRouteIdRef.current ?? route.properties.id);
        });
      };

      const handleMouseMove = (event: MapLayerMouseEvent) => {
        updateSelection(event, (coordinates) => {
          updatePointMarker(hoverPointRef.current, coordinates);
          applyRouteStyles(map, routeLayersRef.current, selectedRouteIdRef.current ?? route.properties.id);
        });
      };

      const handleMouseLeave = () => {
        if (containerRef.current) {
          containerRef.current.style.cursor = "";
        }
        updatePointMarker(hoverPointRef.current, null);
        applyRouteStyles(map, routeLayersRef.current, selectedRouteIdRef.current);
      };

      const handleClick = (event: MapLayerMouseEvent) => {
        event.preventDefault();
        updateSelection(event, (coordinates) => {
          if (isDuplicateSelection(lastRouteSelectionRef.current, coordinates)) {
            return;
          }
          lastRouteSelectionRef.current = {
            position: coordinates,
            timestamp: Date.now(),
          };
          selectedRouteIdRef.current = route.properties.id;
          updatePointMarker(selectedPointRef.current, coordinates);
          applyRouteStyles(map, routeLayersRef.current, route.properties.id);
          onRoutePointSelect?.({
            routeId: route.properties.id,
            routeName: route.properties.name,
            coordinates,
          });
        });
      };

      map.on("mouseenter", bodyLayerId, handleMouseEnter);
      map.on("mousemove", bodyLayerId, handleMouseMove);
      map.on("mouseleave", bodyLayerId, handleMouseLeave);
      map.on("click", bodyLayerId, handleClick);

      return {
        feature: route,
        sourceId,
        casingLayerId,
        bodyLayerId,
        highlightLayerId,
        handleMouseEnter,
        handleMouseMove,
        handleMouseLeave,
        handleClick,
      };
    });

    routeLayersRef.current = routeLayers;

    if (selectedRouteIdRef.current && !routes.some((route) => route.properties.id === selectedRouteIdRef.current)) {
      selectedRouteIdRef.current = null;
      updatePointMarker(selectedPointRef.current, null);
    }

    applyRouteStyles(map, routeLayersRef.current, selectedRouteIdRef.current);

    return () => {
      cleanupRoutes(map, routeLayers);
      if (routeLayersRef.current === routeLayers) {
        routeLayersRef.current = [];
      }
    };
  }, [routes, onRoutePointSelect, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    const existingMarkers = waypointMarkersRef.current;
    const nextWaypointIds = new Set(waypoints.map((waypoint) => waypoint.id));

    for (const [id, entry] of existingMarkers.entries()) {
      if (!nextWaypointIds.has(id)) {
        entry.marker.remove();
        existingMarkers.delete(id);
      }
    }

    waypoints.forEach((waypoint, index) => {
      const isFirst = index === 0;
      const isLast = index === waypoints.length - 1;
      const markerBg = isFirst ? "#22c55e" : isLast && waypoints.length > 1 ? "#ef4444" : "#f97316";

      const existing = existingMarkers.get(waypoint.id);
      const label = waypoint.label ?? `${index + 1}`;
      if (existing) {
        existing.marker.setLngLat([waypoint.lng, waypoint.lat]);
        existing.label.textContent = label;
        existing.marker.getElement().setAttribute("title", waypoint.label ?? `Waypoint ${index + 1}`);
        existing.marker.getElement().style.background = markerBg;
        return;
      }

      const element = document.createElement("div");
      element.style.width = "32px";
      element.style.height = "32px";
      element.style.borderRadius = "9999px";
      element.style.background = markerBg;
      element.style.color = "#fff";
      element.style.display = "flex";
      element.style.alignItems = "center";
      element.style.justifyContent = "center";
      element.style.fontWeight = "700";
      element.style.fontSize = "12px";
      element.style.boxShadow = "0 2px 6px rgba(0,0,0,0.35)";
      element.style.border = "2px solid rgba(255,255,255,0.9)";
      element.style.userSelect = "none";
      element.style.pointerEvents = "none";
      element.title = waypoint.label ?? `Waypoint ${index + 1}`;

      const labelElement = document.createElement("span");
      labelElement.textContent = label;
      element.appendChild(labelElement);

      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([waypoint.lng, waypoint.lat])
        .addTo(map);

      existingMarkers.set(waypoint.id, {
        marker,
        label: labelElement,
      });
    });

    if (waypoints.length === 1) {
      map.flyTo({
        center: [waypoints[0].lng, waypoints[0].lat],
        zoom: Math.max(zoom, 14),
        duration: FLY_TO_DURATION_MS,
      });
      return;
    }

    if (waypoints.length > 1) {
      const bounds = new maplibregl.LngLatBounds(
        [waypoints[0].lng, waypoints[0].lat],
        [waypoints[0].lng, waypoints[0].lat],
      );
      for (let index = 1; index < waypoints.length; index += 1) {
        bounds.extend([waypoints[index].lng, waypoints[index].lat]);
      }
      map.fitBounds(bounds, {
        padding: 60,
        duration: FIT_BOUNDS_DURATION_MS,
        maxZoom: 15,
      });
    }
  }, [waypoints, mapReady, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    sponsoredStopMarkersRef.current.forEach((marker) => marker.remove());

    sponsoredStopMarkersRef.current = sponsoredStops.map((stop) => {
      const buttonId = `add-sponsored-stop-${stop.id}`;
      const popup = new maplibregl.Popup({ offset: 20 }).setHTML([
        `<div style="display:flex;flex-direction:column;gap:8px;min-width:180px;">`,
        `<p style="font-weight:600;margin:0;">${escapeHtml(stop.name)}</p>`,
        stop.description ? `<p style="margin:0;font-size:12px;color:#475569;">${escapeHtml(stop.description)}</p>` : "",
        `<button id="${buttonId}" type="button" style="border:none;border-radius:6px;background:#059669;color:#fff;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;">Add to route</button>`,
        `</div>`,
      ].join(""));

      popup.on("open", () => {
        document.getElementById(buttonId)?.addEventListener("click", () => {
          onSponsoredStopSelect?.(stop);
          popup.remove();
        }, { once: true });
      });

      const element = document.createElement("div");
      const safeLogo = toSafeHttpUrl(stop.logoUrl);
      if (safeLogo) {
        element.style.width = "40px";
        element.style.height = "40px";
        element.style.borderRadius = "9999px";
        element.style.overflow = "hidden";
        element.style.border = "2px solid #fff";
        element.style.boxShadow = "0 2px 8px rgba(0,0,0,0.35)";

        const image = document.createElement("img");
        image.src = safeLogo;
        image.alt = stop.name;
        image.style.width = "100%";
        image.style.height = "100%";
        image.style.objectFit = "cover";
        image.style.display = "block";
        element.appendChild(image);
      } else {
        element.style.width = "18px";
        element.style.height = "18px";
        element.style.borderRadius = "9999px";
        element.style.background = "#059669";
        element.style.border = "2px solid #fff";
        element.style.boxShadow = "0 2px 6px rgba(0,0,0,0.35)";
      }

      return new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([stop.lng, stop.lat])
        .setPopup(popup)
        .addTo(map);
    });

    return () => {
      sponsoredStopMarkersRef.current.forEach((marker) => marker.remove());
      sponsoredStopMarkersRef.current = [];
    };
  }, [sponsoredStops, onSponsoredStopSelect, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !onMapPointSelect) {
      return;
    }

    const handleMapSelect = (event: MapMouseEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      const selection: Position = [event.lngLat.lng, event.lngLat.lat];
      if (isDuplicateSelection(lastMapSelectionRef.current, selection)) {
        return;
      }
      lastMapSelectionRef.current = {
        position: selection,
        timestamp: Date.now(),
      };
      onMapPointSelect(selection);
    };

    map.on("click", handleMapSelect);

    return () => {
      map.off("click", handleMapSelect);
    };
  }, [mapReady, onMapPointSelect]);

  return (
    <div className={cn(className, "relative isolate")}>
      <div ref={containerRef} className="h-full w-full" />

      {/* Style toggle button */}
      <button
        type="button"
        onClick={() => setStyleMode((mode) => mode === "walkable" ? "satellite" : "walkable")}
        className="absolute bottom-8 right-2 z-10 rounded-lg border bg-background/90 px-3 py-1.5 text-xs font-medium shadow backdrop-blur hover:bg-muted active:scale-95 transition-all"
        aria-label={styleMode === "walkable" ? "Switch to satellite view" : "Switch to walkable paths view"}
        aria-pressed={styleMode === "walkable"}
      >
        {styleMode === "walkable" ? "🛰 Satellite" : "🥾 Walkable"}
      </button>

      {/* Legend — only visible in walkable mode */}
      {styleMode === "walkable" && (
        <div className="absolute bottom-8 left-2 z-10 flex items-center gap-3 rounded-full border bg-background/85 px-3 py-1.5 text-xs shadow backdrop-blur">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-[#f5f0e8] bg-transparent" />
            Footpath
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-5 bg-[#6baed6] opacity-60" />
            Road
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-5 rounded bg-[#22c55e] opacity-50" />
            Park
          </span>
        </div>
      )}
    </div>
  );
}

function sanitizeLayerId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function cleanupRoutes(map: MapLibreMap, routeLayers: RouteLayerState[]) {
  routeLayers.forEach((routeLayer) => {
    map.off("mouseenter", routeLayer.bodyLayerId, routeLayer.handleMouseEnter);
    map.off("mousemove", routeLayer.bodyLayerId, routeLayer.handleMouseMove);
    map.off("mouseleave", routeLayer.bodyLayerId, routeLayer.handleMouseLeave);
    map.off("click", routeLayer.bodyLayerId, routeLayer.handleClick);

    if (map.getLayer(routeLayer.highlightLayerId)) {
      map.removeLayer(routeLayer.highlightLayerId);
    }
    if (map.getLayer(routeLayer.bodyLayerId)) {
      map.removeLayer(routeLayer.bodyLayerId);
    }
    if (map.getLayer(routeLayer.casingLayerId)) {
      map.removeLayer(routeLayer.casingLayerId);
    }
    if (map.getSource(routeLayer.sourceId)) {
      map.removeSource(routeLayer.sourceId);
    }
  });
}

function applyRouteStyles(map: MapLibreMap, routeLayers: RouteLayerState[], activeRouteId: string | null) {
  routeLayers.forEach((routeLayer) => {
    if (!map.getLayer(routeLayer.bodyLayerId) || !map.getLayer(routeLayer.casingLayerId)) {
      return;
    }

    const isActive = routeLayer.feature.properties.id === activeRouteId;
    const baseColor = routeLayer.feature.properties.color ?? BASE_ROUTE_STYLE.strokeColor;

    map.setPaintProperty(routeLayer.bodyLayerId, "line-color", isActive ? ACTIVE_ROUTE_STYLE.strokeColor : baseColor);
    map.setPaintProperty(routeLayer.bodyLayerId, "line-opacity", isActive ? ACTIVE_ROUTE_STYLE.strokeOpacity : BASE_ROUTE_STYLE.strokeOpacity);
    map.setPaintProperty(routeLayer.bodyLayerId, "line-width", isActive ? ACTIVE_ROUTE_STYLE.strokeWidth : BASE_ROUTE_STYLE.strokeWidth);

    map.setPaintProperty(routeLayer.casingLayerId, "line-color", isActive ? ACTIVE_ROUTE_STYLE.strokeColor : baseColor);
    map.setPaintProperty(routeLayer.casingLayerId, "line-width", isActive ? ACTIVE_ROUTE_STYLE.casingWidth : BASE_ROUTE_STYLE.casingWidth);
    map.setPaintProperty(routeLayer.casingLayerId, "line-opacity", isActive ? 0.35 : BASE_ROUTE_STYLE.casingOpacity);
  });
}

function createPointMarker(color: string): { marker: Marker; element: HTMLDivElement } {
  const element = document.createElement("div");
  element.style.width = "14px";
  element.style.height = "14px";
  element.style.borderRadius = "9999px";
  element.style.background = color;
  element.style.border = "2px solid #fff";
  element.style.boxShadow = "0 1px 6px rgba(0,0,0,0.35)";
  element.style.pointerEvents = "none";

  return {
    marker: new maplibregl.Marker({ element, anchor: "center" }),
    element,
  };
}

function updatePointMarker(markerState: { marker: Marker; element: HTMLDivElement } | null, coordinates: Position | null) {
  if (!markerState) {
    return;
  }

  if (coordinates) {
    markerState.marker.setLngLat([coordinates[0], coordinates[1]]);
    markerState.element.style.display = "block";
    return;
  }

  markerState.element.style.display = "none";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toSafeHttpUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function arePositionsNear(a: Position, b: Position, epsilon: number): boolean {
  return Math.abs(a[0] - b[0]) < epsilon && Math.abs(a[1] - b[1]) < epsilon;
}

function isDuplicateSelection(
  previousSelection: { position: Position; timestamp: number } | null,
  position: Position,
): boolean {
  if (!previousSelection) {
    return false;
  }

  const selectionAgeMs = Date.now() - previousSelection.timestamp;
  if (selectionAgeMs >= DUPLICATE_EVENT_WINDOW_MS) {
    return false;
  }

  return arePositionsNear(position, previousSelection.position, POSITION_PROXIMITY_EPSILON_DEGREES);
}

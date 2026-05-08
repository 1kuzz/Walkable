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
import { createSatelliteStyle, type Map as MapLibreMap } from "@/lib/maplibre";
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
  const routeLayersRef = useRef<RouteLayerState[]>([]);
  const waypointMarkersRef = useRef<Map<string, { marker: Marker; label: HTMLSpanElement }>>(new Map());
  const sponsoredStopMarkersRef = useRef<Marker[]>([]);
  const selectedRouteIdRef = useRef<string | null>(null);
  const hoverPointRef = useRef<{ marker: Marker; element: HTMLDivElement } | null>(null);
  const selectedPointRef = useRef<{ marker: Marker; element: HTMLDivElement } | null>(null);
  const lastRouteSelectionRef = useRef<{ position: Position; timestamp: number } | null>(null);
  const lastMapSelectionRef = useRef<{ position: Position; timestamp: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    onMapStatusChange?.("loading");

    const initialView = initialViewRef.current;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createSatelliteStyle(),
      center: [initialView.lng, initialView.lat],
      zoom: initialView.zoom,
      attributionControl: true,
    });

    let cancelled = false;

    const handleLoad = () => {
      if (cancelled) {
        return;
      }

      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(
        new maplibregl.GeolocateControl({
          trackUserLocation: false,
          showUserHeading: false,
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

    return () => {
      cancelled = true;
      setMapReady(false);
      cleanupRoutes(map, routeLayersRef.current);
      routeLayersRef.current = [];
      waypointMarkersRef.current.forEach(({ marker }) => marker.remove());
      waypointMarkersRef.current.clear();
      sponsoredStopMarkersRef.current.forEach((marker) => marker.remove());
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || waypoints.length > 0) {
      return;
    }

    map.flyTo({ center: [lng, lat], zoom, duration: 400 });
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
      const existing = existingMarkers.get(waypoint.id);
      const label = waypoint.label ?? `${index + 1}`;
      if (existing) {
        existing.marker.setLngLat([waypoint.lng, waypoint.lat]);
        existing.label.textContent = label;
        existing.marker.getElement().setAttribute("title", waypoint.label ?? `Waypoint ${index + 1}`);
        return;
      }

      const element = document.createElement("div");
      element.style.width = "32px";
      element.style.height = "32px";
      element.style.borderRadius = "9999px";
      element.style.background = "#f97316";
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
        duration: 400,
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
        duration: 600,
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
      if (stop.logoUrl) {
        element.style.width = "40px";
        element.style.height = "40px";
        element.style.borderRadius = "9999px";
        element.style.backgroundImage = `url('${stop.logoUrl}')`;
        element.style.backgroundSize = "cover";
        element.style.backgroundPosition = "center";
        element.style.border = "2px solid #fff";
        element.style.boxShadow = "0 2px 8px rgba(0,0,0,0.35)";
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
      <div ref={containerRef} className="absolute inset-0" />
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
    markerState.marker.setLngLat(coordinates);
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

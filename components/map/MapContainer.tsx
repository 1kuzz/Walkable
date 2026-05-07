"use client";

import { useEffect, useRef, useState } from "react";
import type { Position } from "geojson";
import { nearestPointOnRoute, type RouteFeature, type SponsoredStopMapItem } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { getYandexMapType, loadYandexMapsApi, toGeoJsonCoordinates, toYandexCoordinates, type YandexGeoObject, type YandexMap } from "@/lib/yandex-maps";

interface MapContainerProps {
  lat?: number;
  lng?: number;
  zoom?: number;
  style?: "streets" | "satellite" | "terrain";
  className?: string;
  routes?: RouteFeature[];
  sponsoredStops?: SponsoredStopMapItem[];
  onMapLoad?: (map: YandexMap) => void;
  onRoutePointSelect?: (selection: { routeId: string; routeName: string; coordinates: Position }) => void;
  onSponsoredStopSelect?: (stop: SponsoredStopMapItem) => void;
}

const BASE_ROUTE_STYLE = {
  strokeColor: "#2563eb",
  strokeOpacity: 0.5,
  strokeWidth: 4,
};
const ACTIVE_ROUTE_STYLE = {
  strokeColor: "#f97316",
  strokeOpacity: 0.95,
  strokeWidth: 7,
};
const HOVER_POINT_COLOR = "#facc15";
const SELECTED_POINT_COLOR = "#f97316";

export default function MapContainer({
  lat = 55.7558,
  lng = 37.6173,
  zoom = 11,
  style = "streets",
  className = "w-full h-full",
  routes = [],
  sponsoredStops = [],
  onMapLoad,
  onRoutePointSelect,
  onSponsoredStopSelect,
}: MapContainerProps) {
  const initialViewRef = useRef({ lat, lng, zoom, style });
  const mapRef = useRef<YandexMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const hoverPointRef = useRef<YandexGeoObject | null>(null);
  const selectedPointRef = useRef<YandexGeoObject | null>(null);
  const routeObjectsRef = useRef<Array<{ feature: RouteFeature; line: YandexGeoObject }>>([]);
  const sponsoredStopObjectsRef = useRef<YandexGeoObject[]>([]);
  const selectedRouteIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current) {
      return;
    }

    loadYandexMapsApi()
      .then((ymaps) => {
        if (cancelled || !ymaps || !containerRef.current) {
          return;
        }

        const initialView = initialViewRef.current;
        const map = new ymaps.Map(containerRef.current, {
          center: [initialView.lat, initialView.lng],
          zoom: initialView.zoom,
          type: getYandexMapType(initialView.style),
        });

        map.controls.add("zoomControl");
        map.controls.add("geolocationControl");

        const hoverPoint = new ymaps.Placemark([initialView.lat, initialView.lng], {}, {
          preset: "islands#circleDotIcon",
          iconColor: HOVER_POINT_COLOR,
          visible: false,
        });
        const selectedPoint = new ymaps.Placemark([initialView.lat, initialView.lng], {}, {
          preset: "islands#circleDotIcon",
          iconColor: SELECTED_POINT_COLOR,
          visible: false,
        });

        map.geoObjects.add(hoverPoint);
        map.geoObjects.add(selectedPoint);

        mapRef.current = map;
        hoverPointRef.current = hoverPoint;
        selectedPointRef.current = selectedPoint;
        setMapReady(true);
        onMapLoad?.(map);
      })
      .catch(() => {
        mapRef.current = null;
        setMapReady(false);
      });

    return () => {
      cancelled = true;
      routeObjectsRef.current = [];
      sponsoredStopObjectsRef.current = [];
      selectedRouteIdRef.current = null;
      hoverPointRef.current = null;
      selectedPointRef.current = null;
      setMapReady(false);
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [onMapLoad]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    map.setCenter([lat, lng], zoom);
    map.setType(getYandexMapType(style));
  }, [lat, lng, zoom, style, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    routeObjectsRef.current.forEach(({ line }) => map.geoObjects.remove(line));
    routeObjectsRef.current = routes.map((route) => {
      const line = createRouteLine(route, {
        onHover: (coordinates) => {
          updatePointMarker(hoverPointRef.current, coordinates);
          applyRouteStyles(routeObjectsRef.current, selectedRouteIdRef.current ?? route.properties.id);
          if (containerRef.current) {
            containerRef.current.style.cursor = "pointer";
          }
        },
        onLeave: () => {
          updatePointMarker(hoverPointRef.current, null);
          applyRouteStyles(routeObjectsRef.current, selectedRouteIdRef.current);
          if (containerRef.current) {
            containerRef.current.style.cursor = "";
          }
        },
        onSelect: (coordinates) => {
          selectedRouteIdRef.current = route.properties.id;
          updatePointMarker(selectedPointRef.current, coordinates);
          applyRouteStyles(routeObjectsRef.current, route.properties.id);
          onRoutePointSelect?.({
            routeId: route.properties.id,
            routeName: route.properties.name,
            coordinates,
          });
        },
      });

      map.geoObjects.add(line);
      return { feature: route, line };
    });

    if (selectedRouteIdRef.current && !routes.some((route) => route.properties.id === selectedRouteIdRef.current)) {
      selectedRouteIdRef.current = null;
      updatePointMarker(selectedPointRef.current, null);
    }

    applyRouteStyles(routeObjectsRef.current, selectedRouteIdRef.current);

    return () => {
      routeObjectsRef.current.forEach(({ line }) => map.geoObjects.remove(line));
      routeObjectsRef.current = [];
    };
  }, [routes, onRoutePointSelect, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    sponsoredStopObjectsRef.current.forEach((marker) => map.geoObjects.remove(marker));
    sponsoredStopObjectsRef.current = sponsoredStops.map((stop) => {
      const buttonId = `add-sponsored-stop-${stop.id}`;
      const placemark = createSponsoredStopMarker(stop, buttonId);
      placemark.events.add("balloonopen", () => {
        document.getElementById(buttonId)?.addEventListener("click", () => {
          onSponsoredStopSelect?.(stop);
          placemark.balloon?.close();
        }, { once: true });
      });
      map.geoObjects.add(placemark);
      return placemark;
    });

    return () => {
      sponsoredStopObjectsRef.current.forEach((marker) => map.geoObjects.remove(marker));
      sponsoredStopObjectsRef.current = [];
    };
  }, [sponsoredStops, onSponsoredStopSelect, mapReady]);

  return (
    <div className={cn(className, "relative isolate")}>
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}

function createRouteLine(
  route: RouteFeature,
  handlers: {
    onHover: (coordinates: Position) => void;
    onLeave: () => void;
    onSelect: (coordinates: Position) => void;
  },
): YandexGeoObject {
  const ymaps = window.ymaps;
  if (!ymaps) {
    throw new Error("Yandex Maps is not loaded");
  }

  const line = new ymaps.Polyline(route.geometry.coordinates.map(toYandexCoordinates), {}, {
    ...BASE_ROUTE_STYLE,
    strokeColor: route.properties.color ?? BASE_ROUTE_STYLE.strokeColor,
  });

  const updateSelection = (coords: unknown, callback: (position: Position) => void) => {
    if (!Array.isArray(coords) || coords.length !== 2) {
      return;
    }

    const snapped = nearestPointOnRoute(route, toGeoJsonCoordinates(coords as number[]));
    callback(snapped.coordinates);
  };

  line.events.add("mouseenter", (event) => updateSelection(event.get("coords"), handlers.onHover));
  line.events.add("mousemove", (event) => updateSelection(event.get("coords"), handlers.onHover));
  line.events.add("mouseleave", () => handlers.onLeave());
  line.events.add("click", (event) => updateSelection(event.get("coords"), handlers.onSelect));

  return line;
}

function applyRouteStyles(routeObjects: Array<{ feature: RouteFeature; line: YandexGeoObject }>, activeRouteId: string | null) {
  routeObjects.forEach(({ feature, line }) => {
    const isActive = feature.properties.id === activeRouteId;
    line.options.set("strokeColor", isActive ? ACTIVE_ROUTE_STYLE.strokeColor : feature.properties.color ?? BASE_ROUTE_STYLE.strokeColor);
    line.options.set("strokeOpacity", isActive ? ACTIVE_ROUTE_STYLE.strokeOpacity : BASE_ROUTE_STYLE.strokeOpacity);
    line.options.set("strokeWidth", isActive ? ACTIVE_ROUTE_STYLE.strokeWidth : BASE_ROUTE_STYLE.strokeWidth);
  });
}

function updatePointMarker(marker: YandexGeoObject | null, coordinates: Position | null) {
  if (!marker?.geometry) {
    return;
  }

  if (coordinates) {
    marker.geometry.setCoordinates(toYandexCoordinates(coordinates));
    marker.options.set("visible", true);
    return;
  }

  marker.options.set("visible", false);
}

function createSponsoredStopMarker(stop: SponsoredStopMapItem, buttonId: string): YandexGeoObject {
  const ymaps = window.ymaps;
  if (!ymaps) {
    throw new Error("Yandex Maps is not loaded");
  }

  const properties = {
    balloonContentBody: [
      `<div style="display:flex;flex-direction:column;gap:8px;min-width:180px;">`,
      `<p style="font-weight:600;margin:0;">${escapeHtml(stop.name)}</p>`,
      stop.description ? `<p style="margin:0;font-size:12px;color:#475569;">${escapeHtml(stop.description)}</p>` : "",
      `<button id="${buttonId}" type="button" style="border:none;border-radius:6px;background:#059669;color:#fff;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;">Add to route</button>`,
      `</div>`,
    ].join(""),
  };

  if (stop.logoUrl) {
    return new ymaps.Placemark([stop.lat, stop.lng], properties, {
      balloonCloseButton: true,
      iconImageHref: stop.logoUrl,
      iconImageOffset: [-20, -20],
      iconImageSize: [40, 40],
      iconLayout: "default#image",
    });
  }

  return new ymaps.Placemark([stop.lat, stop.lng], properties, {
    balloonCloseButton: true,
    preset: "islands#greenFoodIcon",
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

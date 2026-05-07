"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Position } from "geojson";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { createFeatureCollection, createPointFeature, nearestPointOnRoute, type RouteFeature, type SponsoredStopMapItem } from "@/lib/geo";

interface MapContainerProps {
  lat?: number;
  lng?: number;
  zoom?: number;
  style?: "streets" | "satellite" | "terrain";
  className?: string;
  routes?: RouteFeature[];
  sponsoredStops?: SponsoredStopMapItem[];
  onMapLoad?: (map: mapboxgl.Map) => void;
  onRoutePointSelect?: (selection: { routeId: string; routeName: string; coordinates: Position }) => void;
  onSponsoredStopSelect?: (stop: SponsoredStopMapItem) => void;
}

const ROUTE_SOURCE_ID = "walkable-routes";
const ROUTE_BASE_LAYER_ID = "walkable-routes-base";
const ROUTE_ACTIVE_LAYER_ID = "walkable-routes-active";
const HOVER_POINT_SOURCE_ID = "walkable-routes-hover-point";
const PERSISTENT_POINT_SOURCE_ID = "walkable-routes-selected-point";
const HOVER_POINT_LAYER_ID = "walkable-routes-hover-point-layer";
const PERSISTENT_POINT_LAYER_ID = "walkable-routes-selected-point-layer";
const MARKER_BUTTON_CLASS = [
  "flex h-11 w-11 items-center justify-center rounded-full",
  "border-2 border-white bg-emerald-600 text-sm font-semibold text-white shadow-lg",
].join(" ");
const MARKER_IMAGE_CLASS = ["h-10 w-10 rounded-full", "object-cover"].join(" ");

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
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const selectedRouteIdRef = useRef<string | null>(null);
  const currentRoutesRef = useRef<RouteFeature[]>(routes);

  const styleUrls = useMemo(
    () => ({
      streets: "mapbox://styles/mapbox/streets-v12",
      satellite: "mapbox://styles/mapbox/satellite-streets-v12",
      terrain: "mapbox://styles/mapbox/outdoors-v12",
    }),
    [],
  );

  useEffect(() => {
    currentRoutesRef.current = routes;
  }, [routes]);

  useEffect(() => {
    if (!containerRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: styleUrls[style],
      center: [lng, lat],
      zoom,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "top-right");

    const updatePointSource = (sourceId: string, coordinates: Position | null) => {
      const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData(
        coordinates
          ? createPointFeature(coordinates)
          : { type: "FeatureCollection", features: [] },
      );
    };

    const updateActiveRoute = (routeId: string | null) => {
      if (map.getLayer(ROUTE_ACTIVE_LAYER_ID)) {
        map.setFilter(ROUTE_ACTIVE_LAYER_ID, routeId ? ["==", ["get", "id"], routeId] : ["==", ["get", "id"], ""]);
      }
    };

    const findRouteFeature = (featureId?: string) => currentRoutesRef.current.find((route) => route.properties.id === featureId);

    const handleRouteHover = (event: mapboxgl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const routeId = typeof feature?.properties?.id === "string" ? feature.properties.id : undefined;
      const route = findRouteFeature(routeId);
      if (!route) {
        map.getCanvas().style.cursor = "";
        updatePointSource(HOVER_POINT_SOURCE_ID, null);
        updateActiveRoute(selectedRouteIdRef.current);
        return;
      }

      const snapped = nearestPointOnRoute(route, [event.lngLat.lng, event.lngLat.lat]);
      map.getCanvas().style.cursor = "pointer";
      updatePointSource(HOVER_POINT_SOURCE_ID, snapped.coordinates);
      updateActiveRoute(selectedRouteIdRef.current ?? route.properties.id);
    };

    const handleRouteLeave = () => {
      map.getCanvas().style.cursor = "";
      updatePointSource(HOVER_POINT_SOURCE_ID, null);
      updateActiveRoute(selectedRouteIdRef.current);
    };

    const handleRouteClick = (event: mapboxgl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const routeId = typeof feature?.properties?.id === "string" ? feature.properties.id : undefined;
      const route = findRouteFeature(routeId);
      if (!route) return;

      const snapped = nearestPointOnRoute(route, [event.lngLat.lng, event.lngLat.lat]);
      selectedRouteIdRef.current = route.properties.id;
      updatePointSource(PERSISTENT_POINT_SOURCE_ID, snapped.coordinates);
      updateActiveRoute(route.properties.id);
      onRoutePointSelect?.({
        routeId: route.properties.id,
        routeName: route.properties.name,
        coordinates: snapped.coordinates,
      });
    };

    map.on("load", () => {
      mapRef.current = map;
      map.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: createFeatureCollection(currentRoutesRef.current),
      });
      map.addSource(HOVER_POINT_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource(PERSISTENT_POINT_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: ROUTE_BASE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#2563eb"],
          "line-width": 4,
          "line-opacity": 0.5,
        },
      });
      map.addLayer({
        id: ROUTE_ACTIVE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        filter: ["==", ["get", "id"], ""],
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#f97316"],
          "line-width": 7,
          "line-opacity": 0.95,
        },
      });
      map.addLayer({
        id: HOVER_POINT_LAYER_ID,
        type: "circle",
        source: HOVER_POINT_SOURCE_ID,
        paint: {
          "circle-radius": 7,
          "circle-color": "#facc15",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
      map.addLayer({
        id: PERSISTENT_POINT_LAYER_ID,
        type: "circle",
        source: PERSISTENT_POINT_SOURCE_ID,
        paint: {
          "circle-radius": 8,
          "circle-color": "#f97316",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });

      map.on("mousemove", ROUTE_BASE_LAYER_ID, handleRouteHover);
      map.on("mouseleave", ROUTE_BASE_LAYER_ID, handleRouteLeave);
      map.on("click", ROUTE_BASE_LAYER_ID, handleRouteClick);
      onMapLoad?.(map);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
    };
  }, [lat, lng, zoom, style, styleUrls, onMapLoad, onRoutePointSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    const routeSource = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    routeSource?.setData(createFeatureCollection(routes));

    if (selectedRouteIdRef.current && !routes.some((route) => route.properties.id === selectedRouteIdRef.current)) {
      selectedRouteIdRef.current = null;
      const selectedPointSource = map.getSource(PERSISTENT_POINT_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      selectedPointSource?.setData({ type: "FeatureCollection", features: [] });
    }

    if (map.getLayer(ROUTE_ACTIVE_LAYER_ID)) {
      map.setFilter(
        ROUTE_ACTIVE_LAYER_ID,
        selectedRouteIdRef.current ? ["==", ["get", "id"], selectedRouteIdRef.current] : ["==", ["get", "id"], ""],
      );
    }
  }, [routes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    const markers = sponsoredStops.map((stop) => {
      const markerElement = document.createElement("button");
      markerElement.type = "button";
      markerElement.className = MARKER_BUTTON_CLASS;
      if (stop.logoUrl) {
        markerElement.innerHTML = `<img src="${stop.logoUrl}" alt="${stop.name}" class="${MARKER_IMAGE_CLASS}" />`;
      } else {
        markerElement.textContent = "🍽️";
      }

      const popupElement = document.createElement("div");
      popupElement.className = "space-y-2";
      const title = document.createElement("p");
      title.className = "font-semibold";
      title.textContent = stop.name;
      popupElement.appendChild(title);

      if (stop.description) {
        const description = document.createElement("p");
        description.className = "text-xs text-slate-600";
        description.textContent = stop.description;
        popupElement.appendChild(description);
      }

      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.className = "rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white";
      actionButton.textContent = "Add to route";
      actionButton.addEventListener("click", () => onSponsoredStopSelect?.(stop));
      popupElement.appendChild(actionButton);

      const popup = new mapboxgl.Popup({ offset: 18 }).setDOMContent(popupElement);
      return new mapboxgl.Marker(markerElement).setLngLat([stop.lng, stop.lat]).setPopup(popup).addTo(map);
    });

    markersRef.current = markers;

    return () => {
      markers.forEach((marker) => marker.remove());
      if (markersRef.current === markers) {
        markersRef.current = [];
      }
    };
  }, [sponsoredStops, onSponsoredStopSelect]);

  return <div ref={containerRef} className={className} />;
}

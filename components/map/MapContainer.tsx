"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface MapContainerProps {
  lat?: number;
  lng?: number;
  zoom?: number;
  style?: "streets" | "satellite" | "terrain";
  className?: string;
  onMapLoad?: (map: mapboxgl.Map) => void;
}

export default function MapContainer({
  lat = 55.7558,
  lng = 37.6173,
  zoom = 11,
  style = "streets",
  className = "w-full h-full",
  onMapLoad,
}: MapContainerProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const styleUrls = {
    streets: "mapbox://styles/mapbox/streets-v12",
    satellite: "mapbox://styles/mapbox/satellite-streets-v12",
    terrain: "mapbox://styles/mapbox/outdoors-v12",
  };

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

    map.on("load", () => {
      mapRef.current = map;
      onMapLoad?.(map);
    });

    return () => map.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, zoom, style]);

  return <div ref={containerRef} className={className} />;
}

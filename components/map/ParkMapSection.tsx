"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { parseRouteGeometry, type RouteFeature } from "@/lib/geo";

const MapContainer = dynamic(() => import("@/components/map/MapContainer"), {
  ssr: false,
  loading: () => <Skeleton className="w-full h-full" />,
});

interface ParkRouteItem {
  id: string;
  name: string;
  geometryGeoJson?: string | null;
}

interface ParkMapSectionProps {
  lat: number;
  lng: number;
  routes: ParkRouteItem[];
}

export default function ParkMapSection({ lat, lng, routes }: ParkMapSectionProps) {
  const routeFeatures = useMemo<RouteFeature[]>(
    () =>
      routes
        .map((r) => parseRouteGeometry(r.geometryGeoJson, { id: r.id, name: r.name, color: "#22c55e" }))
        .filter((f): f is RouteFeature => Boolean(f)),
    [routes],
  );

  const handleRouteSelect = ({ routeId }: { routeId: string }) => {
    document.getElementById(`route-${routeId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="h-72 w-full overflow-hidden rounded-xl border">
      <MapContainer
        lat={lat}
        lng={lng}
        zoom={14}
        className="h-full w-full"
        routes={routeFeatures}
        onRoutePointSelect={handleRouteSelect}
      />
    </div>
  );
}

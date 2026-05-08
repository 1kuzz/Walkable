"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { parseRouteGeometry, parseWalkwayGeometry, type RouteFeature, type WalkwayFeature } from "@/lib/geo";

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
  parkId: string;
  lat: number;
  lng: number;
  routes: ParkRouteItem[];
}

interface ParkWalkwayItem {
  id: string;
  osmId: string;
  name?: string | null;
  type: string;
  geometryGeoJson?: string | null;
}

const PARK_ROUTE_COLOR = "#22c55e";

export default function ParkMapSection({ parkId, lat, lng, routes }: ParkMapSectionProps) {
  const [walkways, setWalkways] = useState<ParkWalkwayItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/walkways?parkId=${encodeURIComponent(parkId)}`, {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then(async (response) => response.json())
      .then((payload) => setWalkways(Array.isArray(payload) ? payload : []))
      .catch(() => {
        if (!controller.signal.aborted) {
          setWalkways([]);
        }
      });

    return () => {
      controller.abort();
    };
  }, [parkId]);

  const routeFeatures = useMemo<RouteFeature[]>(
    () =>
      routes
        .map((r) => parseRouteGeometry(r.geometryGeoJson, { id: r.id, name: r.name, color: PARK_ROUTE_COLOR }))
        .filter((f): f is RouteFeature => Boolean(f)),
    [routes],
  );
  const walkwayFeatures = useMemo<WalkwayFeature[]>(
    () =>
      walkways
        .map((walkway) => parseWalkwayGeometry(walkway.geometryGeoJson, {
          id: walkway.id,
          osmId: walkway.osmId,
          name: walkway.name ?? undefined,
          type: walkway.type,
        }))
        .filter((feature): feature is WalkwayFeature => Boolean(feature)),
    [walkways],
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
        walkways={walkwayFeatures}
        onRoutePointSelect={handleRouteSelect}
      />
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const MapContainer = dynamic(() => import("@/components/map/MapContainer"), {
  ssr: false,
  loading: () => <Skeleton className="w-full h-full" />,
});

export default function RouteBuilderPage() {
  const [routeName, setRouteName] = useState("");
  const [waypoints, setWaypoints] = useState<{ lat: number; lng: number; name: string }[]>([]);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Panel */}
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
            <p>📏 Distance: calculating…</p>
            <p>⬆️ Elevation: —</p>
          </CardContent>
        </Card>

        {waypoints.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Waypoints</h3>
            <div className="space-y-1">
              {waypoints.map((wp, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-2 rounded border">
                  <span>{wp.name || `Point ${i + 1}`}</span>
                  <button onClick={() => setWaypoints((p) => p.filter((_, j) => j !== i))} className="text-destructive hover:underline" aria-label="Remove waypoint">×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button className="w-full" disabled={!routeName || waypoints.length < 2}>
          Publish Route
        </Button>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer className="w-full h-full" />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur rounded-lg px-4 py-2 text-sm text-muted-foreground shadow">
          Click on the map to add waypoints
        </div>
      </div>
    </div>
  );
}

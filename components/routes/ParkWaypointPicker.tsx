"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface NearbyPark {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  description?: string | null;
  _count: { routes: number };
}

interface ParkWaypointPickerProps {
  centerLat: number;
  centerLng: number;
  onAddPark: (park: { lat: number; lng: number; name: string }) => void;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function ParkWaypointPicker({ centerLat, centerLng, onAddPark }: ParkWaypointPickerProps) {
  const [parks, setParks] = useState<NearbyPark[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    fetch(`/api/parks?lat=${centerLat}&lng=${centerLng}&radius=10`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => res.json())
      .then((payload) => {
        if (!cancelled) {
          setParks(Array.isArray(payload) ? payload : []);
        }
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) {
          setParks([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, centerLat, centerLng]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
        >
          <CardTitle className="text-base">🌳 Nearby Parks</CardTitle>
          <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-2 pt-0">
          {loading && <p className="text-sm text-muted-foreground">Loading nearby parks…</p>}
          {!loading && parks.length === 0 && (
            <p className="text-sm text-muted-foreground">No parks found within 10 km.</p>
          )}
          {!loading && parks.map((park) => {
            const distKm = haversineKm(centerLat, centerLng, park.lat, park.lng);
            return (
              <div key={park.id} className="flex items-start justify-between gap-2 rounded-lg border p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{park.name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    <Badge variant="secondary" className="capitalize text-[10px] px-1 py-0">{park.type}</Badge>
                    <span className="text-[10px] text-muted-foreground">{distKm.toFixed(1)} km away</span>
                    {park._count.routes > 0 && (
                      <span className="text-[10px] text-muted-foreground">{park._count.routes} route{park._count.routes !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 text-xs"
                  onClick={() => onAddPark({ lat: park.lat, lng: park.lng, name: park.name })}
                >
                  + Add
                </Button>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}

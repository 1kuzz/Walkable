"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SponsoredStopMapItem } from "@/lib/geo";

interface RouteOptionsProps {
  includeFoodStops: boolean;
  loading: boolean;
  sponsoredStops: SponsoredStopMapItem[];
  selectedSponsoredStopId?: string | null;
  onIncludeFoodStopsChange: (enabled: boolean) => void;
  onSponsoredStopSelect: (stop: SponsoredStopMapItem) => void;
}

export default function RouteOptions({
  includeFoodStops,
  loading,
  sponsoredStops,
  selectedSponsoredStopId,
  onIncludeFoodStopsChange,
  onSponsoredStopSelect,
}: RouteOptionsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Route options</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox checked={includeFoodStops} onCheckedChange={(value) => onIncludeFoodStopsChange(Boolean(value))} />
          <div>
            <p className="font-medium">Include food stops?</p>
            <p className="text-sm text-muted-foreground">Add sponsored meal stops and re-route the walk around them.</p>
          </div>
        </label>

        {includeFoodStops && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Sponsored meals nearby</p>
            {loading && <p className="text-sm text-muted-foreground">Loading nearby stops…</p>}
            {!loading && sponsoredStops.length === 0 && (
              <p className="text-sm text-muted-foreground">No sponsored stops found nearby yet.</p>
            )}
            {!loading && sponsoredStops.map((stop) => (
              <div key={stop.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{stop.name}</p>
                    {stop.description && <p className="mt-1 text-sm text-muted-foreground">{stop.description}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant={selectedSponsoredStopId === stop.id ? "secondary" : "outline"}
                    onClick={() => onSponsoredStopSelect(stop)}
                  >
                    {selectedSponsoredStopId === stop.id ? "Added" : "Add to route"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

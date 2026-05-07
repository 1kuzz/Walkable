"use client";

import { useEffect, useMemo, useState } from "react";
import type { Position } from "geojson";
import MapContainer from "@/components/map/MapContainer";
import RouteOptions from "@/components/routes/RouteOptions";
import CompletionCard from "@/components/routes/CompletionCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRouteEndpoints, type RouteFeature, type SponsoredStopMapItem } from "@/lib/geo";
import { getRoute } from "@/lib/routing";

interface RouteExperienceProps {
  routeId: string;
  routeName: string;
  parkName: string;
  parkLat: number;
  parkLng: number;
  routeFeature: RouteFeature | null;
  distanceKm: number;
  durationMin: number;
  caloriesBurned: number;
  isAuthenticated: boolean;
}

interface CompletionResponse {
  completion: {
    caloriesBurned: number;
    durationMin: number;
  };
  achievements: string[];
}

export default function RouteExperience({
  routeId,
  routeName,
  parkName,
  parkLat,
  parkLng,
  routeFeature,
  distanceKm,
  durationMin,
  caloriesBurned,
  isAuthenticated,
}: RouteExperienceProps) {
  const [includeFoodStops, setIncludeFoodStops] = useState(false);
  const [loadingStops, setLoadingStops] = useState(false);
  const [sponsoredStops, setSponsoredStops] = useState<SponsoredStopMapItem[]>([]);
  const [selectedSponsoredStopId, setSelectedSponsoredStopId] = useState<string | null>(null);
  const [reroutedFeature, setReroutedFeature] = useState<RouteFeature | null>(null);
  const [completionState, setCompletionState] = useState<CompletionResponse | null>(null);
  const [submittingCompletion, setSubmittingCompletion] = useState(false);

  useEffect(() => {
    if (!includeFoodStops) {
      return;
    }

    let cancelled = false;
    fetch(`/api/sponsored?lat=${parkLat}&lng=${parkLng}&radius=3&routeId=${routeId}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!cancelled) {
          setSponsoredStops(Array.isArray(payload) ? payload : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSponsoredStops([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingStops(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [includeFoodStops, parkLat, parkLng, routeId]);

  const routeWaypoints = useMemo<Position[]>(() => {
    if (routeFeature) {
      return getRouteEndpoints(routeFeature);
    }
    return [];
  }, [routeFeature]);

  const displayRoute = includeFoodStops ? reroutedFeature ?? routeFeature : routeFeature;
  const visibleSponsoredStops = includeFoodStops ? sponsoredStops : [];
  const visibleSelectedSponsoredStopId = includeFoodStops ? selectedSponsoredStopId : null;

  const handleSponsoredStopSelect = async (stop: SponsoredStopMapItem) => {
    setSelectedSponsoredStopId(stop.id);
    if (routeWaypoints.length < 2) {
      return;
    }

    try {
      const rerouted = await getRoute([routeWaypoints[0], [stop.lng, stop.lat], routeWaypoints[1]], `${routeName} via ${stop.name}`);
      setReroutedFeature(rerouted?.feature ?? null);
    } catch {
      setReroutedFeature(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Interactive route map</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-80 overflow-hidden rounded-xl border">
            <MapContainer
              lat={parkLat}
              lng={parkLng}
              zoom={13}
              routes={displayRoute ? [displayRoute] : []}
              sponsoredStops={visibleSponsoredStops}
              onSponsoredStopSelect={handleSponsoredStopSelect}
            />
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            Hover the route to highlight it. Tap once to pin your next destination on the path.
          </div>
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{parkName}</p>
            <p className="text-muted-foreground">Keep the route glowing, add a meal stop if you want a snack break, then brag a little when you finish.</p>
          </div>
        </CardContent>
      </Card>

      <RouteOptions
        includeFoodStops={includeFoodStops}
        loading={loadingStops}
        sponsoredStops={visibleSponsoredStops}
        selectedSponsoredStopId={visibleSelectedSponsoredStopId}
        onIncludeFoodStopsChange={(enabled) => {
          setIncludeFoodStops(enabled);
          setLoadingStops(enabled);
          if (!enabled) {
            setSelectedSponsoredStopId(null);
            setReroutedFeature(null);
          }
        }}
        onSponsoredStopSelect={handleSponsoredStopSelect}
      />

      {isAuthenticated && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Completion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Tell the app you finished this walk and we&apos;ll celebrate with stats you can share.</p>
            <Button
              disabled={submittingCompletion}
              onClick={async () => {
                setSubmittingCompletion(true);
                const response = await fetch(`/api/routes/${routeId}/complete`, { method: "POST" });
                const payload = await response.json();
                setSubmittingCompletion(false);
                if (response.ok) {
                  setCompletionState(payload as CompletionResponse);
                }
              }}
            >
              {submittingCompletion ? "Saving…" : "Mark as completed"}
            </Button>
          </CardContent>
        </Card>
      )}

      <CompletionCard
        open={Boolean(completionState)}
        routeName={routeName}
        distanceKm={distanceKm}
        durationMin={completionState?.completion.durationMin ?? durationMin}
        caloriesBurned={completionState?.completion.caloriesBurned ?? caloriesBurned}
        achievements={completionState?.achievements ?? []}
        sharePath={`/routes/${routeId}`}
        onClose={() => setCompletionState(null)}
      />
    </div>
  );
}

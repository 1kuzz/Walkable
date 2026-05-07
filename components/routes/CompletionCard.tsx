"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCalories } from "@/lib/calories";

interface CompletionCardProps {
  open: boolean;
  routeName: string;
  distanceKm: number;
  durationMin: number;
  caloriesBurned: number;
  achievements: string[];
  sharePath: string;
  onClose: () => void;
}

const achievementEmoji: Record<string, string> = {
  first_route: "🏃",
  km_10: "🥉",
  km_50: "🥈",
  km_100: "🥇",
  explorer: "🗺️",
  mountain_goat: "⛰️",
};

export default function CompletionCard({
  open,
  routeName,
  distanceKm,
  durationMin,
  caloriesBurned,
  achievements,
  sharePath,
  onClose,
}: CompletionCardProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const message = useMemo(() => {
    if (distanceKm >= 10) return "You absolutely crushed that route. Legendary energy.";
    if (distanceKm >= 5) return "Strong walk. Strong vibes. Share the flex.";
    return "Nice work. You got out there and made the route yours.";
  }, [distanceKm]);

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${sharePath}`;
  const shareText = `I just walked ${distanceKm.toFixed(1)} km and burned about ${formatCalories(caloriesBurned)} on the ${routeName} 🔥 ${shareUrl}`;

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-xl">You did it 🎉</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{message}</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Distance</p>
              <p className="font-semibold">{distanceKm.toFixed(1)} km</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Time</p>
              <p className="font-semibold">{durationMin} min</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Calories</p>
              <p className="font-semibold">{formatCalories(caloriesBurned)}</p>
            </div>
          </div>

          {achievements.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Unlocked achievements</p>
              <div className="flex flex-wrap gap-2">
                {achievements.map((achievement) => (
                  <Badge key={achievement} variant="secondary" className="gap-1">
                    {achievementEmoji[achievement] ?? "🏅"} {achievement.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">Share on X</a>
            </Button>
            <Button asChild variant="outline">
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">WhatsApp</a>
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareText);
                  setCopyError(null);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopyError("Copy failed. Please use the share buttons instead.");
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          {copyError && <p className="text-sm text-destructive">{copyError}</p>}

          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

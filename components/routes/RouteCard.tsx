"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookmarkIcon, StarIcon } from "lucide-react";

interface RouteCardProps {
  id: string;
  name: string;
  parkName?: string;
  difficulty: "easy" | "moderate" | "hard";
  lengthKm: number;
  elevationGain: number;
  estimatedMin: number;
  rating?: number;
  reviewCount?: number;
  coverPhoto?: string;
  saved?: boolean;
  onSave?: (id: string) => void;
}

const difficultyConfig = {
  easy: { label: "Easy", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  moderate: { label: "Moderate", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  hard: { label: "Hard", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

export default function RouteCard({ id, name, parkName, difficulty, lengthKm, elevationGain, estimatedMin, rating, reviewCount, coverPhoto, saved, onSave }: RouteCardProps) {
  const diff = difficultyConfig[difficulty];

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow group">
      <Link href={`/routes/${id}`}>
        <div className="relative h-36 bg-gradient-to-br from-green-400 to-emerald-600 overflow-hidden">
          {coverPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverPhoto} alt={name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/50 text-4xl">🌿</div>
          )}
          <div className="absolute top-2 left-2">
            <Badge className={diff.className}>{diff.label}</Badge>
          </div>
        </div>
      </Link>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/routes/${id}`}>
              <h3 className="font-semibold text-sm leading-tight truncate hover:underline">{name}</h3>
            </Link>
            {parkName && <p className="text-xs text-muted-foreground truncate">{parkName}</p>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-7 w-7"
            onClick={() => onSave?.(id)}
            aria-label={saved ? "Remove from saved" : "Save route"}
          >
            <BookmarkIcon className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
          </Button>
        </div>
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          <span>📍 {lengthKm.toFixed(1)} km</span>
          <span>⬆️ {elevationGain}m</span>
          <span>⏱️ {estimatedMin}min</span>
        </div>
        {rating !== undefined && (
          <div className="flex items-center gap-1 mt-1">
            <StarIcon className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            <span className="text-xs font-medium">{rating.toFixed(1)}</span>
            {reviewCount !== undefined && <span className="text-xs text-muted-foreground">({reviewCount})</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

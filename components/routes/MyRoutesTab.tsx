"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RouteCard from "@/components/routes/RouteCard";
import { Button } from "@/components/ui/button";
import { Trash2Icon } from "lucide-react";

interface Route {
  id: string;
  name: string;
  parkName: string;
  difficulty: "easy" | "moderate" | "hard";
  lengthKm: number;
  elevationGain: number;
  estimatedMin: number;
  reviewCount: number;
}

export default function MyRoutesTab({ routes }: { routes: Route[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this route? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/routes/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeletedIds((prev) => new Set(prev).add(id));
        router.refresh();
      }
    } finally {
      setDeletingId(null);
    }
  };

  const visible = routes.filter((r) => !deletedIds.has(r.id));

  if (visible.length === 0) {
    return <p className="text-muted-foreground col-span-3">You haven&apos;t created any routes yet.</p>;
  }

  return (
    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
      {visible.map((route) => (
        <div key={route.id} className="relative group">
          <RouteCard
            id={route.id}
            name={route.name}
            parkName={route.parkName}
            difficulty={route.difficulty}
            lengthKm={route.lengthKm}
            elevationGain={route.elevationGain}
            estimatedMin={route.estimatedMin}
            reviewCount={route.reviewCount}
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-8 w-8 opacity-100 sm:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
            disabled={deletingId === route.id}
            onClick={() => handleDelete(route.id)}
            aria-label={`Delete route ${route.name}`}
          >
            <Trash2Icon className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

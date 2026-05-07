"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import FilterSidebar, { FilterState } from "@/components/routes/FilterSidebar";
import { Skeleton } from "@/components/ui/skeleton";

const MapContainer = dynamic(() => import("@/components/map/MapContainer"), { ssr: false, loading: () => <Skeleton className="w-full h-full" /> });

const defaultFilters: FilterState = { parkTypes: [], difficulties: [], maxLength: 20, sort: "popular" };

export default function MapPage() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? "w-80" : "w-0"} shrink-0 overflow-y-auto border-r bg-background transition-all duration-300 z-10`}>
        <div className="p-4">
          <FilterSidebar filters={filters} onChange={setFilters} />
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          className="w-full h-full"
        />
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-4 left-4 z-10 bg-background border rounded-lg p-2 shadow-md hover:bg-muted transition-colors"
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? "◀" : "▶"}
        </button>
      </div>
    </div>
  );
}

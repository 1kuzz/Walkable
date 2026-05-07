import { Skeleton } from "@/components/ui/skeleton";

export default function ParkLoading() {
  return (
    <div className="min-h-screen">
      <Skeleton className="h-64 w-full rounded-none" />
      <div className="max-w-6xl mx-auto px-4 py-8 grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <Skeleton className="h-7 w-48 mb-4" />
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

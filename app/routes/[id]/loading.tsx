import { Skeleton } from "@/components/ui/skeleton";

export default function RouteLoading() {
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Skeleton className="h-4 w-48 mb-6" />
        <Skeleton className="h-9 w-80 mb-3" />
        <div className="flex gap-2 mb-8">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="grid lg:grid-cols-[minmax(0,2fr),360px] gap-8">
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

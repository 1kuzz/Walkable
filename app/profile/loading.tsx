import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-6">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-48" />
            <div className="flex gap-4 mt-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        </div>
        <Skeleton className="h-20 w-full max-w-sm rounded-xl" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-10 w-80 rounded-lg" />
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

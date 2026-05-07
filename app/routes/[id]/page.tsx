import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { StarIcon } from "lucide-react";
import WeatherWidget from "@/components/weather/WeatherWidget";
import ElevationProfile from "@/components/routes/ElevationProfile";

export default async function RoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let route;
  try {
    route = await db.route.findUnique({
      where: { id },
      include: {
        park: true,
        waypoints: true,
        reviews: { include: { user: { select: { name: true, image: true } } }, orderBy: { createdAt: "desc" } },
        photos: { include: { user: { select: { name: true } } } },
        createdBy: { select: { name: true, image: true } },
      },
    });
  } catch {
    notFound();
  }

  if (!route) notFound();

  const avgRating = route.reviews.length
    ? route.reviews.reduce((s, r) => s + r.rating, 0) / route.reviews.length
    : null;

  const difficultyColors = {
    easy: "bg-green-100 text-green-700",
    moderate: "bg-yellow-100 text-yellow-700",
    hard: "bg-red-100 text-red-700",
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
            <a href={`/parks/${route.parkId}`} className="hover:underline">{route.park.name}</a>
            <span>/</span>
            <span>{route.name}</span>
          </div>
          <h1 className="text-3xl font-bold mb-3">{route.name}</h1>
          <div className="flex flex-wrap gap-2 items-center">
            <Badge className={difficultyColors[route.difficulty]}>{route.difficulty}</Badge>
            <Badge variant="outline">{route.surfaceType}</Badge>
            {avgRating && (
              <span className="flex items-center gap-1 text-sm">
                <StarIcon className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                {avgRating.toFixed(1)} ({route.reviews.length} reviews)
              </span>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Distance", value: `${route.lengthKm.toFixed(1)} km` },
                { label: "Elevation", value: `${route.elevationGain}m` },
                { label: "Est. Time", value: `${route.estimatedMin}min` },
                { label: "Surface", value: route.surfaceType },
              ].map((s) => (
                <div key={s.label} className="text-center p-3 rounded-xl border bg-card">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="font-semibold capitalize">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Elevation */}
            <div>
              <h2 className="text-lg font-semibold mb-2">Elevation Profile</h2>
              <ElevationProfile data={[]} />
            </div>

            {/* Reviews */}
            <div>
              <h2 className="text-lg font-semibold mb-3">Reviews ({route.reviews.length})</h2>
              <div className="space-y-3">
                {route.reviews.map((review) => (
                  <div key={review.id} className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-2 mb-1">
                      {review.user.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={review.user.image} className="h-6 w-6 rounded-full" alt="" />
                      )}
                      <span className="text-sm font-medium">{review.user.name}</span>
                      <span className="flex">{Array.from({ length: review.rating }).map((_, i) => <StarIcon key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />)}</span>
                    </div>
                    {review.body && <p className="text-sm text-muted-foreground">{review.body}</p>}
                  </div>
                ))}
                {route.reviews.length === 0 && <p className="text-muted-foreground text-sm">No reviews yet.</p>}
              </div>
            </div>

            {/* Photos */}
            {route.photos.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3">Photos</h2>
                <div className="grid grid-cols-3 gap-2">
                  {route.photos.map((photo) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={photo.id} src={photo.url} className="aspect-square object-cover rounded-lg" alt="" />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <WeatherWidget lat={route.park.lat} lng={route.park.lng} />
          </div>
        </div>
      </div>
    </div>
  );
}

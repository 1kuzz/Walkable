import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import WeatherWidget from "@/components/weather/WeatherWidget";
import RouteCard from "@/components/routes/RouteCard";
import ParkMapSection from "@/components/map/ParkMapSection";
import { Badge } from "@/components/ui/badge";

export default async function ParkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let park;
  try {
    park = await db.park.findUnique({
      where: { id },
      include: {
        routes: {
          include: { _count: { select: { reviews: true } } },
        },
      },
    });
  } catch {
    notFound();
  }

  if (!park) notFound();

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="relative h-64 bg-gradient-to-br from-green-700 to-emerald-900 overflow-hidden">
        {park.coverPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={park.coverPhoto} alt={park.name} className="absolute inset-0 w-full h-full object-cover opacity-70" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 p-6 text-white">
          <Badge variant="secondary" className="mb-2 capitalize">{park.type}</Badge>
          <h1 className="text-3xl font-bold">{park.name}</h1>
          {park.description && <p className="text-white/80 mt-1 text-sm max-w-xl">{park.description}</p>}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Map panel — shows walkable paths and park routes */}
        <ParkMapSection
          parkId={park.id}
          lat={park.lat}
          lng={park.lng}
          routes={park.routes.map((r) => ({ id: r.id, name: r.name, geometryGeoJson: r.geometryGeoJson }))}
        />

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <h2 className="text-xl font-semibold mb-4">Routes in {park.name}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {park.routes.map((route) => (
                <div key={route.id} id={`route-${route.id}`}>
                  <RouteCard
                    id={route.id}
                    name={route.name}
                    difficulty={route.difficulty}
                    lengthKm={route.lengthKm}
                    elevationGain={route.elevationGain}
                    estimatedMin={route.estimatedMin}
                    reviewCount={route._count.reviews}
                  />
                </div>
              ))}
              {park.routes.length === 0 && (
                <p className="text-muted-foreground col-span-2">No routes yet. Be the first to add one!</p>
              )}
            </div>
          </div>
          <div>
            <WeatherWidget lat={park.lat} lng={park.lng} />
          </div>
        </div>
      </div>
    </div>
  );
}

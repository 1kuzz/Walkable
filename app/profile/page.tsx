import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import RouteCard from "@/components/routes/RouteCard";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: {
      routes: { include: { _count: { select: { reviews: true } } }, orderBy: { createdAt: "desc" } },
      savedRoutes: { include: { route: { include: { _count: { select: { reviews: true } } } } } },
      achievements: true,
    },
  });

  if (!user) redirect("/login");

  const achievementEmoji: Record<string, string> = {
    first_route: "🏃",
    km_10: "🥉",
    km_50: "🥈",
    km_100: "🥇",
    explorer: "🗺️",
    photographer: "📸",
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Profile Header */}
      <div className="flex items-center gap-6 mb-8">
        <Avatar className="h-20 w-20">
          <AvatarImage src={user.image ?? ""} alt={user.name ?? ""} />
          <AvatarFallback>{user.name?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold">{user.name}</h1>
          <p className="text-muted-foreground">{user.email}</p>
          <div className="flex gap-4 mt-2 text-sm">
            <span>🏃 {user.totalKm.toFixed(1)} km</span>
            <span>🗺️ {user.routesCount} routes</span>
            <span>📸 {user.photosCount} photos</span>
          </div>
        </div>
      </div>

      {/* Achievements */}
      {user.achievements.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold mb-3">Achievements</h2>
          <div className="flex flex-wrap gap-2">
            {user.achievements.map((a) => (
              <Badge key={a.id} variant="secondary" className="gap-1 text-sm py-1 px-3">
                {achievementEmoji[a.type] ?? "🏅"} {a.type.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="my-routes">
        <TabsList>
          <TabsTrigger value="my-routes">My Routes ({user.routes.length})</TabsTrigger>
          <TabsTrigger value="saved">Saved ({user.savedRoutes.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="my-routes">
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            {user.routes.map((route) => (
              <RouteCard
                key={route.id}
                id={route.id}
                name={route.name}
                difficulty={route.difficulty}
                lengthKm={route.lengthKm}
                elevationGain={route.elevationGain}
                estimatedMin={route.estimatedMin}
                reviewCount={route._count.reviews}
              />
            ))}
            {user.routes.length === 0 && (
              <p className="text-muted-foreground col-span-3">You haven&apos;t created any routes yet.</p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="saved">
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            {user.savedRoutes.map(({ route }) => (
              <RouteCard
                key={route.id}
                id={route.id}
                name={route.name}
                difficulty={route.difficulty}
                lengthKm={route.lengthKm}
                elevationGain={route.elevationGain}
                estimatedMin={route.estimatedMin}
                reviewCount={route._count.reviews}
                saved
              />
            ))}
            {user.savedRoutes.length === 0 && (
              <p className="text-muted-foreground col-span-3">No saved routes yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

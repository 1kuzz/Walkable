import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import RouteCard from "@/components/routes/RouteCard";
import ProfileWeightForm from "@/components/routes/ProfileWeightForm";
import { formatCalories } from "@/lib/calories";

const completionDateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: {
      routes: { include: { park: { select: { name: true } }, _count: { select: { reviews: true } } }, orderBy: { createdAt: "desc" } },
      savedRoutes: { include: { route: { include: { park: { select: { name: true } }, _count: { select: { reviews: true } } } } } },
      achievements: { orderBy: { unlockedAt: "desc" } },
      completions: {
        include: { route: { select: { id: true, name: true, lengthKm: true } } },
        orderBy: { completedAt: "desc" },
        take: 12,
      },
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
    mountain_goat: "⛰️",
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-6">
          <Avatar className="h-20 w-20">
            <AvatarImage src={user.image ?? ""} alt={user.name ?? ""} />
            <AvatarFallback>{user.name?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{user.name}</h1>
            <p className="text-muted-foreground">{user.email}</p>
            <div className="flex gap-4 mt-2 text-sm">
              <span>🏃 {user.totalKm.toFixed(1)} km</span>
              <span>✅ {user.routesCount} completed</span>
              <span>📸 {user.photosCount} photos</span>
            </div>
          </div>
        </div>
        <div className="w-full max-w-sm">
          <ProfileWeightForm initialWeightKg={user.weightKg} />
        </div>
      </div>

      {user.achievements.length > 0 && (
        <div>
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

      <Tabs defaultValue="my-routes">
        <TabsList>
          <TabsTrigger value="my-routes">My Routes ({user.routes.length})</TabsTrigger>
          <TabsTrigger value="saved">Saved ({user.savedRoutes.length})</TabsTrigger>
          <TabsTrigger value="walks">Completed Walks ({user.completions.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="my-routes">
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            {user.routes.map((route) => (
              <RouteCard
                key={route.id}
                id={route.id}
                name={route.name}
                parkName={route.park.name}
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
                parkName={route.park.name}
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
        <TabsContent value="walks">
          <div className="mt-4 space-y-3">
            {user.completions.map((completion) => (
              <div key={completion.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{completion.route.name}</p>
                    <p className="text-sm text-muted-foreground">{completionDateFormatter.format(completion.completedAt)}</p>
                  </div>
                  <div className="flex gap-3 text-sm text-muted-foreground">
                    <span>{completion.route.lengthKm.toFixed(1)} km</span>
                    <span>{completion.durationMin} min</span>
                    <span>{formatCalories(completion.caloriesBurned)}</span>
                  </div>
                </div>
              </div>
            ))}
            {user.completions.length === 0 && (
              <p className="text-muted-foreground">No completed walks yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

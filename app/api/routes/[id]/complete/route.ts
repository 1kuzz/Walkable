import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { estimateCalories } from "@/lib/calories";
import { getNewAchievementTypes } from "@/lib/achievements";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const route = await db.route.findUnique({ where: { id }, select: { id: true, lengthKm: true, elevationGain: true, estimatedMin: true } });
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        weightKg: true,
        totalKm: true,
        routesCount: true,
        achievements: { select: { type: true } },
      },
    });

    if (!route || !user) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    const caloriesBurned = estimateCalories({
      estimatedMin: route.estimatedMin,
      lengthKm: route.lengthKm,
      elevationGain: route.elevationGain,
      weightKg: user.weightKg,
    });

    const totalKmAfterCompletion = user.totalKm + route.lengthKm;
    const totalCompletionsAfterCompletion = user.routesCount + 1;
    const newAchievementTypes = getNewAchievementTypes({
      currentAchievementTypes: user.achievements.map((achievement) => achievement.type),
      totalKmAfterCompletion,
      totalCompletionsAfterCompletion,
      elevationGain: route.elevationGain,
    });

    const completion = await db.$transaction(async (tx) => {
      const created = await tx.routeCompletion.create({
        data: {
          routeId: route.id,
          userId: user.id,
          durationMin: route.estimatedMin,
          caloriesBurned,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          totalKm: totalKmAfterCompletion,
          routesCount: totalCompletionsAfterCompletion,
        },
      });

      if (newAchievementTypes.length > 0) {
        await tx.achievement.createMany({
          data: newAchievementTypes.map((type) => ({ userId: user.id, type })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    return NextResponse.json({ completion, achievements: newAchievementTypes });
  } catch {
    return NextResponse.json({ error: "Failed to complete route" }, { status: 500 });
  }
}

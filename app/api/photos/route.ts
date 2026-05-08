import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveUploadedPhoto } from "@/lib/server/photo-storage";
import { logServerEvent, toErrorMessage } from "@/lib/server/logger";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const routeId = formData.get("routeId") as string | null;
    const waypointId = formData.get("waypointId") as string | null;
    const result = await saveUploadedPhoto(file);

    const photo = await db.photo.create({
      data: {
        url: result.url,
        publicId: result.publicId,
        userId: session.user.id,
        routeId: routeId || undefined,
        waypointId: waypointId || undefined,
      },
    });

    // Increment photosCount and grant the "photographer" achievement on first photo upload.
    try {
      const updatedUser = await db.user.update({
        where: { id: session.user.id },
        data: { photosCount: { increment: 1 } },
        select: { photosCount: true, achievements: { select: { type: true } } },
      });

      if (
        updatedUser.photosCount === 1 &&
        !updatedUser.achievements.some((a) => a.type === "photographer")
      ) {
        await db.achievement
          .create({ data: { userId: session.user.id, type: "photographer" } })
          .catch(() => {});
      }
    } catch {
      // Stats update is best-effort; photo upload already succeeded.
    }

    return NextResponse.json(photo, { status: 201 });
  } catch (error) {
    logServerEvent("error", "photos.upload_failed", {
      userId: session.user.id,
      error: toErrorMessage(error),
    });
    return NextResponse.json({ error: "Failed to upload photo" }, { status: 500 });
  }
}

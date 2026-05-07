import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json() as { weightKg?: number };
    const weightKg = Number(body.weightKg);

    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) {
      return NextResponse.json({ error: "Weight must be between 30 and 300 kg" }, { status: 400 });
    }

    const user = await db.user.update({
      where: { id: session.user.id },
      data: { weightKg },
      select: { id: true, weightKg: true },
    });

    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}

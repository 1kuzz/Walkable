import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const park = await db.park.findUnique({
      where: { id },
      include: {
        routes: {
          include: {
            _count: { select: { reviews: true } },
          },
        },
      },
    });
    if (!park) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(park);
  } catch {
    return NextResponse.json({ error: "Failed to fetch park" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { readStoredPhoto } from "@/lib/server/photo-storage";

export async function GET(_request: Request, context: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await context.params;
  const photo = await readStoredPhoto(slug);

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  return new Response(new Uint8Array(photo.body), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": photo.contentType,
    },
  });
}

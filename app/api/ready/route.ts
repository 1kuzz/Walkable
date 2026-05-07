import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logServerEvent, toErrorMessage } from "@/lib/server/logger";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const checkDb = url.searchParams.get("checkDb") === "1";
  const checkExternal = url.searchParams.get("checkExternal") === "1";

  const checks: Record<string, { ok: boolean; details?: string }> = {
    app: { ok: true },
  };

  if (checkDb) {
    try {
      await db.$queryRaw`SELECT 1`;
      checks.db = { ok: true };
    } catch (error) {
      checks.db = { ok: false, details: "Database connectivity check failed" };
      logServerEvent("error", "readiness.db_check_failed", {
        error: toErrorMessage(error),
      });
    }
  }

  if (checkExternal) {
    checks.external = {
      ok: Boolean(process.env.YANDEX_WEATHER_API_KEY && process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY),
      details: "Checks API key presence for weather/maps",
    };
  }

  const ready = Object.values(checks).every((check) => check.ok);
  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
}

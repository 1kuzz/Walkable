import { NextRequest, NextResponse } from "next/server";
import { getTrailStatus, getWeatherForecast } from "@/lib/weather/yandex";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "55.7558");
  const lng = parseFloat(searchParams.get("lng") ?? "37.6173");

  try {
    const forecast = await getWeatherForecast(Number.isFinite(lat) ? lat : 55.7558, Number.isFinite(lng) ? lng : 37.6173);
    return NextResponse.json({ ...forecast, trailStatus: getTrailStatus(forecast) });
  } catch {
    return NextResponse.json({ error: "Failed to fetch weather" }, { status: 500 });
  }
}

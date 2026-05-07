import { NextRequest, NextResponse } from "next/server";
import { getWeatherForecast, getTrailStatus } from "@/lib/weather/open-meteo";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "55.7558");
  const lng = parseFloat(searchParams.get("lng") ?? "37.6173");

  try {
    const data = await getWeatherForecast(lat, lng);
    const trailStatus = getTrailStatus(data);
    return NextResponse.json({ ...data, trailStatus });
  } catch {
    return NextResponse.json({ error: "Failed to fetch weather" }, { status: 500 });
  }
}

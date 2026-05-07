import { NextRequest, NextResponse } from "next/server";

interface WeatherPayload {
  current?: {
    precipitation?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat") ?? "55.7558";
  const lng = searchParams.get("lng") ?? "37.6173";

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,wind_speed_10m,visibility,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=auto&forecast_days=4`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
    const data = await res.json() as WeatherPayload;

    const trailStatus = getTrailStatus(data);
    return NextResponse.json({ ...data, trailStatus });
  } catch {
    return NextResponse.json({ error: "Failed to fetch weather" }, { status: 500 });
  }
}

function getTrailStatus(weather: WeatherPayload): { status: "open" | "muddy" | "closed"; reason: string } {
  const current = weather.current;
  if (!current) return { status: "open", reason: "Weather data unavailable" };

  const precipitation = current.precipitation ?? 0;
  const windSpeed = current.wind_speed_10m ?? 0;
  const weatherCode = current.weather_code ?? 0;

  if (weatherCode >= 71 || windSpeed > 60 || precipitation > 10) {
    return { status: "closed", reason: "Severe weather conditions" };
  }
  if (precipitation > 0 || (weatherCode >= 51 && weatherCode <= 67)) {
    return { status: "muddy", reason: "Recent precipitation — trail may be muddy" };
  }
  return { status: "open", reason: "Good conditions for walking" };
}

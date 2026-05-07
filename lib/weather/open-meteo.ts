export interface WeatherForecast {
  current: {
    temperature_2m: number;
    precipitation: number;
    wind_speed_10m: number;
    weather_code: number;
    visibility: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    weather_code: number[];
  };
}

export type TrailStatus = "open" | "muddy" | "closed";

export interface TrailStatusResult {
  status: TrailStatus;
  reason: string;
}

export async function getWeatherForecast(lat: number, lng: number): Promise<WeatherForecast> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lng.toString());
  url.searchParams.set("current", "temperature_2m,precipitation,wind_speed_10m,visibility,weather_code");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "4");

  const res = await fetch(url.toString(), { next: { revalidate: 1800 } });
  if (!res.ok) throw new Error("Weather API error");
  return res.json();
}

export function getTrailStatus(weather: WeatherForecast): TrailStatusResult {
  const { current } = weather;
  const precipitation = current.precipitation ?? 0;
  const windSpeed = current.wind_speed_10m ?? 0;
  const weatherCode = current.weather_code ?? 0;
  const visibility = current.visibility ?? 10000;

  if (weatherCode >= 71 || windSpeed > 60 || precipitation > 10 || visibility < 500) {
    return { status: "closed", reason: "Severe weather — trail not recommended" };
  }
  if (precipitation > 0 || (weatherCode >= 51 && weatherCode <= 67)) {
    return { status: "muddy", reason: "Recent precipitation — trail may be muddy" };
  }
  return { status: "open", reason: "Great conditions for a walk! 🌤️" };
}

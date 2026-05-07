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

interface YandexWeatherPart {
  condition?: string;
  prec_mm?: number;
  precipitation?: number;
  temp?: number;
  temp_avg?: number;
  temp_max?: number;
  temp_min?: number;
  wind_speed?: number;
}

interface YandexWeatherForecast {
  date?: string;
  parts?: {
    day?: YandexWeatherPart;
    day_short?: YandexWeatherPart;
    evening?: YandexWeatherPart;
    morning?: YandexWeatherPart;
    night?: YandexWeatherPart;
    night_short?: YandexWeatherPart;
  };
}

interface YandexWeatherResponse {
  fact?: {
    condition?: string;
    precipitation?: number;
    prec_mm?: number;
    temp?: number;
    visibility?: number;
    wind_speed?: number;
  };
  forecasts?: YandexWeatherForecast[];
}

export async function getWeatherForecast(lat: number, lng: number): Promise<WeatherForecast> {
  const apiKey = process.env.YANDEX_WEATHER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Yandex Weather API key");
  }

  const url = new URL("https://api.weather.yandex.ru/v2/forecast");
  url.searchParams.set("lat", lat.toString());
  url.searchParams.set("lon", lng.toString());
  url.searchParams.set("limit", "4");
  url.searchParams.set("hours", "false");
  url.searchParams.set("extra", "false");

  const res = await fetch(url.toString(), {
    headers: {
      "X-Yandex-API-Key": apiKey,
    },
    next: { revalidate: 1800 },
  });
  if (!res.ok) {
    throw new Error("Weather API error");
  }

  const payload = await res.json() as YandexWeatherResponse;
  return normalizeYandexWeatherResponse(payload);
}

export function normalizeYandexWeatherResponse(payload: YandexWeatherResponse): WeatherForecast {
  const current = payload.fact ?? {};
  const forecasts = (payload.forecasts ?? []).slice(0, 4);

  return {
    current: {
      temperature_2m: current.temp ?? 0,
      precipitation: readPrecipitation(current),
      wind_speed_10m: convertMetersPerSecondToKmH(current.wind_speed ?? 0),
      weather_code: mapConditionToWeatherCode(current.condition),
      visibility: normalizeVisibility(current.visibility),
    },
    daily: {
      time: forecasts.map((forecast) => forecast.date ?? new Date().toISOString().slice(0, 10)),
      temperature_2m_max: forecasts.map((forecast) => readDailyMaximum(forecast.parts)),
      temperature_2m_min: forecasts.map((forecast) => readDailyMinimum(forecast.parts)),
      precipitation_sum: forecasts.map((forecast) => readDailyPrecipitation(forecast.parts)),
      weather_code: forecasts.map((forecast) => mapConditionToWeatherCode(readDailyCondition(forecast.parts))),
    },
  };
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

function readDailyCondition(parts: YandexWeatherForecast["parts"]): string | undefined {
  return parts?.day_short?.condition
    ?? parts?.day?.condition
    ?? parts?.morning?.condition
    ?? parts?.evening?.condition
    ?? parts?.night_short?.condition
    ?? parts?.night?.condition;
}

function readDailyMaximum(parts: YandexWeatherForecast["parts"]): number {
  return parts?.day?.temp_max
    ?? parts?.day_short?.temp
    ?? parts?.day_short?.temp_max
    ?? parts?.day?.temp
    ?? 0;
}

function readDailyMinimum(parts: YandexWeatherForecast["parts"]): number {
  return parts?.night?.temp_min
    ?? parts?.night_short?.temp
    ?? parts?.day_short?.temp_min
    ?? parts?.day?.temp_min
    ?? 0;
}

function readDailyPrecipitation(parts: YandexWeatherForecast["parts"]): number {
  return [parts?.night, parts?.morning, parts?.day, parts?.evening, parts?.day_short, parts?.night_short]
    .reduce((sum, part) => sum + readPrecipitation(part), 0);
}

function readPrecipitation(part?: { precipitation?: number; prec_mm?: number }): number {
  return part?.precipitation ?? part?.prec_mm ?? 0;
}

function normalizeVisibility(visibility?: number): number {
  if (typeof visibility !== "number") {
    return 10000;
  }

  return visibility <= 100 ? visibility * 1000 : visibility;
}

function convertMetersPerSecondToKmH(speed: number): number {
  return Math.round(speed * 3.6 * 10) / 10;
}

function mapConditionToWeatherCode(condition?: string): number {
  switch (condition) {
    case "clear":
      return 0;
    case "partly-cloudy":
      return 2;
    case "cloudy":
      return 3;
    case "overcast":
    case "mist":
    case "fog":
      return 45;
    case "drizzle":
      return 55;
    case "light-rain":
    case "rain":
    case "moderate-rain":
    case "heavy-rain":
    case "continuous-heavy-rain":
    case "showers":
      return 61;
    case "wet-snow":
    case "light-snow":
    case "snow":
    case "snow-showers":
      return 73;
    case "hail":
      return 82;
    case "thunderstorm":
    case "thunderstorm-with-rain":
      return 95;
    default:
      return 0;
  }
}

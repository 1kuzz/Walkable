import { describe, it, expect } from "vitest";
import { getTrailStatus } from "@/lib/weather/open-meteo";
import type { WeatherForecast } from "@/lib/weather/open-meteo";

function makeForecast(current: WeatherForecast["current"]): WeatherForecast {
  return {
    current,
    daily: {
      time: [],
      temperature_2m_max: [],
      temperature_2m_min: [],
      precipitation_sum: [],
      weather_code: [],
    },
  };
}

describe("getTrailStatus", () => {
  it("returns open for clear, calm weather", () => {
    const result = getTrailStatus(
      makeForecast({ temperature_2m: 18, precipitation: 0, wind_speed_10m: 15, weather_code: 0, visibility: 10000 })
    );
    expect(result.status).toBe("open");
    expect(result.reason).toBeTruthy();
  });

  it("returns muddy when there is light precipitation", () => {
    const result = getTrailStatus(
      makeForecast({ temperature_2m: 10, precipitation: 1, wind_speed_10m: 10, weather_code: 61, visibility: 5000 })
    );
    expect(result.status).toBe("muddy");
    expect(result.reason).toMatch(/precipitation/i);
  });

  it("returns muddy when drizzle weather code is in range 51–67", () => {
    const result = getTrailStatus(
      makeForecast({ temperature_2m: 8, precipitation: 0, wind_speed_10m: 5, weather_code: 55, visibility: 5000 })
    );
    expect(result.status).toBe("muddy");
  });

  it("returns closed for heavy wind (> 60 km/h)", () => {
    const result = getTrailStatus(
      makeForecast({ temperature_2m: 5, precipitation: 0, wind_speed_10m: 65, weather_code: 0, visibility: 10000 })
    );
    expect(result.status).toBe("closed");
    expect(result.reason).toMatch(/severe/i);
  });

  it("returns closed for heavy precipitation (> 10 mm)", () => {
    const result = getTrailStatus(
      makeForecast({ temperature_2m: 12, precipitation: 15, wind_speed_10m: 20, weather_code: 65, visibility: 3000 })
    );
    expect(result.status).toBe("closed");
  });

  it("returns closed for snow (weather code ≥ 71)", () => {
    const result = getTrailStatus(
      makeForecast({ temperature_2m: -2, precipitation: 3, wind_speed_10m: 10, weather_code: 73, visibility: 2000 })
    );
    expect(result.status).toBe("closed");
  });

  it("returns closed for very low visibility (< 500 m)", () => {
    const result = getTrailStatus(
      makeForecast({ temperature_2m: 8, precipitation: 0, wind_speed_10m: 5, weather_code: 45, visibility: 200 })
    );
    expect(result.status).toBe("closed");
  });

  it("returns open when wind is exactly at the boundary (60 km/h)", () => {
    const result = getTrailStatus(
      makeForecast({ temperature_2m: 15, precipitation: 0, wind_speed_10m: 60, weather_code: 0, visibility: 10000 })
    );
    expect(result.status).toBe("open");
  });

  it("returns open when visibility is exactly at the boundary (500 m)", () => {
    const result = getTrailStatus(
      makeForecast({ temperature_2m: 10, precipitation: 0, wind_speed_10m: 10, weather_code: 0, visibility: 500 })
    );
    expect(result.status).toBe("open");
  });
});

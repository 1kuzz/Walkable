import { describe, it, expect } from "vitest";
import { getTrailStatus, normalizeYandexWeatherResponse } from "@/lib/weather/yandex";
import type { WeatherForecast } from "@/lib/weather/yandex";

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

describe("normalizeYandexWeatherResponse", () => {
  it("normalizes current and daily Yandex weather fields", () => {
    const result = normalizeYandexWeatherResponse({
      fact: {
        condition: "light-rain",
        precipitation: 1.5,
        temp: 7,
        visibility: 0.4,
        wind_speed: 5,
      },
      forecasts: [
        {
          date: "2026-05-07",
          parts: {
            day: { temp_max: 9, temp_min: 4, prec_mm: 1.2, condition: "light-rain" },
            night: { temp_min: 2, prec_mm: 0.3, condition: "cloudy" },
          },
        },
        {
          date: "2026-05-08",
          parts: {
            day_short: { temp: 3, temp_min: -1, prec_mm: 2, condition: "snow" },
            night_short: { temp: -2, prec_mm: 0.5, condition: "snow" },
          },
        },
      ],
    });

    expect(result.current.temperature_2m).toBe(7);
    expect(result.current.precipitation).toBe(1.5);
    expect(result.current.wind_speed_10m).toBe(18);
    expect(result.current.weather_code).toBe(61);
    expect(result.current.visibility).toBe(400);

    expect(result.daily.time).toEqual(["2026-05-07", "2026-05-08"]);
    expect(result.daily.temperature_2m_max).toEqual([9, 3]);
    expect(result.daily.temperature_2m_min).toEqual([2, -2]);
    expect(result.daily.precipitation_sum).toEqual([1.5, 2.5]);
    expect(result.daily.weather_code).toEqual([61, 73]);
  });
});

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface WeatherData {
  current: {
    temperature_2m: number;
    precipitation: number;
    wind_speed_10m: number;
    weather_code: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    weather_code: number[];
  };
  trailStatus: { status: "open" | "muddy" | "closed"; reason: string };
}

function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  return "⛈️";
}

const statusConfig = {
  open: { label: "✅ Trail Open", variant: "default" as const, className: "bg-green-500 text-white" },
  muddy: { label: "⚠️ Possibly Muddy", variant: "secondary" as const, className: "bg-yellow-500 text-white" },
  closed: { label: "❌ Trail Closed", variant: "destructive" as const, className: "" },
};

export default function WeatherWidget({ lat, lng }: { lat: number; lng: number }) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/weather?lat=${lat}&lng=${lng}`)
      .then((r) => r.json())
      .then(setWeather)
      .finally(() => setLoading(false));
  }, [lat, lng]);

  if (loading) return (
    <Card>
      <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-4 w-full" />
      </CardContent>
    </Card>
  );

  if (!weather) return null;
  const { current, daily, trailStatus } = weather;
  const status = statusConfig[trailStatus.status];

  return (
    <Card className="glass">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          Weather
          <Badge className={status.className}>{status.label}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-4xl">{weatherEmoji(current.weather_code)}</span>
          <div>
            <p className="text-2xl font-bold">{Math.round(current.temperature_2m)}°C</p>
            <p className="text-xs text-muted-foreground">
              💧 {current.precipitation}mm · 💨 {Math.round(current.wind_speed_10m)} km/h
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{trailStatus.reason}</p>
        <div className="grid grid-cols-3 gap-2">
          {daily.time.slice(1, 4).map((date, i) => (
            <div key={date} className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">{new Date(date).toLocaleDateString("en", { weekday: "short" })}</p>
              <p className="text-lg">{weatherEmoji(daily.weather_code[i + 1])}</p>
              <p className="text-xs font-medium">{Math.round(daily.temperature_2m_max[i + 1])}°</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

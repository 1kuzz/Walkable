"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface ElevationPoint { distance: number; elevation: number; }

export default function ElevationProfile({ data }: { data: ElevationPoint[] }) {
  if (!data?.length) return null;
  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="distance" tickFormatter={(v) => `${v.toFixed(1)}km`} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}m`} width={40} />
          <Tooltip formatter={(v) => [`${v}m`, "Elevation"]} labelFormatter={(l) => `${Number(l).toFixed(2)} km`} />
          <Area type="monotone" dataKey="elevation" stroke="#10b981" fill="url(#elevGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

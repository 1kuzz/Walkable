import { NextRequest, NextResponse } from "next/server";
import { getRoute } from "@/lib/routing";
import type { GetRouteOptions, RoutePreference, TransportMode } from "@/lib/routing";
import { DEFAULT_ROUTE_NAME } from "@/lib/routing-defaults";
import { isValidRoutePosition } from "@/lib/routing-coordinates";
import { logServerEvent, toErrorMessage } from "@/lib/server/logger";

function isPosition(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === "number"
    && typeof value[1] === "number"
    && isValidRoutePosition([value[0], value[1]]);
}

function parseWaypoints(value: unknown): Array<[number, number]> | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }
  const parsed = value.filter(isPosition).map((point) => [point[0], point[1]] as [number, number]);
  return parsed.length >= 2 ? parsed : null;
}

function parseRouteOptions(value: unknown): GetRouteOptions | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const options = value as { waypointHints?: unknown; knownRouteGeometries?: unknown };
  const parsedOptions: GetRouteOptions = {};

  if (Array.isArray(options.waypointHints)) {
    parsedOptions.waypointHints = options.waypointHints.map((hint) => {
      if (!hint || typeof hint !== "object") {
        return {};
      }
      const routeId = (hint as { routeId?: unknown }).routeId;
      return typeof routeId === "string" ? { routeId } : {};
    });
  }

  if (options.knownRouteGeometries && typeof options.knownRouteGeometries === "object") {
    const parsedGeometries: NonNullable<GetRouteOptions["knownRouteGeometries"]> = {};
    Object.entries(options.knownRouteGeometries as Record<string, unknown>).forEach(([routeId, geometry]) => {
      if (!Array.isArray(geometry)) {
        return;
      }
      const coordinates = geometry.filter(isPosition).map((point) => [point[0], point[1]] as [number, number]);
      if (coordinates.length >= 2) {
        parsedGeometries[routeId] = coordinates;
      }
    });
    parsedOptions.knownRouteGeometries = parsedGeometries;
  }

  return parsedOptions;
}

export async function POST(req: NextRequest) {
  let waypointCount: number | undefined;
  let routeName: string | undefined;
  let routePreference: RoutePreference | undefined;
  let routeMode: TransportMode | undefined;

  try {
    const payload = await req.json() as {
      waypoints?: unknown;
      name?: unknown;
      preference?: unknown;
      mode?: unknown;
      options?: unknown;
    };

    const waypoints = parseWaypoints(payload.waypoints);
    if (!waypoints) {
      return NextResponse.json({ error: "Invalid waypoints payload." }, { status: 400 });
    }
    waypointCount = waypoints.length;

    const name = typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim()
      : DEFAULT_ROUTE_NAME;
    routeName = name;

    const preference = payload.preference === "foot" || payload.preference === "park" || payload.preference === "walkable"
      ? payload.preference
      : "park";
    const mode = payload.mode === "car" || payload.mode === "foot" ? payload.mode : "foot";
    routeMode = mode;
    const normalizedPreference: RoutePreference = mode === "car" ? "foot" : preference;
    routePreference = normalizedPreference;

    const result = await getRoute(waypoints, name, normalizedPreference, parseRouteOptions(payload.options), mode);
    return NextResponse.json(result);
  } catch (error) {
    logServerEvent("error", "routing.calculate_failed", {
      error: toErrorMessage(error),
      waypointCount,
      routeName,
      routePreference,
      routeMode,
    });
    return NextResponse.json({ error: "Failed to calculate route" }, { status: 500 });
  }
}

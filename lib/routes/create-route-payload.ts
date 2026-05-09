import type { Difficulty, SurfaceType } from "@prisma/client";
import type { Feature, LineString } from "geojson";

const DIFFICULTIES: ReadonlySet<Difficulty> = new Set(["easy", "moderate", "hard"]);
const SURFACE_TYPES: ReadonlySet<SurfaceType> = new Set(["paved", "gravel", "dirt", "mixed"]);
const TRANSPORT_MODES: ReadonlySet<TransportMode> = new Set(["foot", "car"]);
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
const MIN_WAYPOINTS = 2;
const MAX_WAYPOINTS = 50;
const DUPLICATE_COORDINATE_PRECISION = 6;
const COORDINATE_PRECISION_MULTIPLIER = 10 ** DUPLICATE_COORDINATE_PRECISION;

interface CreateWaypointInput {
  lat: number;
  lng: number;
  name?: string;
}

type TransportMode = "foot" | "car";

export interface CreateRouteData {
  parkId: string;
  name: string;
  description: string | null;
  difficulty: Difficulty;
  lengthKm: number;
  elevationGain: number;
  surfaceType: SurfaceType;
  transportMode: TransportMode;
  estimatedMin: number;
  geometryGeoJson: string;
  waypoints: {
    create: CreateWaypointInput[];
  };
}

export function validateCreateRoutePayload(payload: unknown): { data?: CreateRouteData; error?: string } {
  if (!isRecord(payload)) {
    return { error: "Route payload must be a JSON object" };
  }

  const parkId = sanitizeId(payload.parkId);
  if (!parkId) {
    return { error: "parkId is required" };
  }

  const name = sanitizeName(payload.name);
  if (!name) {
    return { error: "name is required" };
  }

  const difficulty = parseDifficulty(payload.difficulty ?? "easy");
  if (!difficulty) {
    return { error: "difficulty must be one of: easy, moderate, hard" };
  }

  const surfaceType = parseSurfaceType(payload.surfaceType ?? "mixed");
  if (!surfaceType) {
    return { error: "surfaceType must be one of: paved, gravel, dirt, mixed" };
  }

  const lengthKm = parseBoundedNumber(payload.lengthKm, { min: 0.1, max: 500 });
  if (lengthKm == null) {
    return { error: "lengthKm must be a number between 0.1 and 500" };
  }

  const elevationGain = parseBoundedNumber(payload.elevationGain, { min: 0, max: 20000 });
  if (elevationGain == null) {
    return { error: "elevationGain must be a number between 0 and 20000" };
  }

  const estimatedMin = parseBoundedInteger(payload.estimatedMin, { min: 1, max: 24 * 60 });
  if (estimatedMin == null) {
    return { error: "estimatedMin must be an integer between 1 and 1440" };
  }
  const transportMode = parseTransportMode(payload.transportMode ?? "foot");
  if (!transportMode) {
    return { error: "transportMode must be one of: foot, car" };
  }

  const geometry = parseLineStringGeometry(payload.geometryGeoJson);
  if (!geometry) {
    return { error: "geometryGeoJson must contain a valid LineString geometry with at least 2 points" };
  }

  const waypoints = parseWaypoints(payload.waypoints);
  if (!waypoints) {
    return { error: "waypoints must include at least 2 valid points" };
  }
  if (waypoints.length > MAX_WAYPOINTS) {
    return { error: `waypoints must not exceed ${MAX_WAYPOINTS} points` };
  }
  if (hasDuplicateWaypoints(waypoints)) {
    return { error: "waypoints must not contain duplicate points" };
  }

  return {
    data: {
      parkId,
      name,
      description: sanitizeDescription(payload.description),
      difficulty,
      lengthKm,
      elevationGain,
      surfaceType,
      transportMode,
      estimatedMin,
      geometryGeoJson: JSON.stringify(geometry),
      waypoints: {
        create: waypoints.map((waypoint) => ({
          lat: waypoint.lat,
          lng: waypoint.lng,
          name: waypoint.name,
        })),
      },
    },
  };
}

function parseWaypoints(value: unknown): CreateWaypointInput[] | null {
  const candidate = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.create)
      ? value.create
      : null;

  if (!candidate || candidate.length < MIN_WAYPOINTS) {
    return null;
  }

  const parsed = candidate
    .map((item) => parseWaypoint(item))
    .filter((item): item is CreateWaypointInput => Boolean(item));

  return parsed.length >= MIN_WAYPOINTS ? parsed : null;
}

function parseWaypoint(value: unknown): CreateWaypointInput | null {
  if (!isRecord(value)) {
    return null;
  }

  const lat = parseBoundedCoordinate(value.lat, { min: -90, max: 90 });
  const lng = parseBoundedCoordinate(value.lng, { min: -180, max: 180 });
  if (lat == null || lng == null) {
    return null;
  }

  const name = sanitizeOptionalName(value.name);
  return { lat, lng, name };
}

function parseLineStringGeometry(value: unknown): LineString | null {
  const parsed = parseJsonValue(value);
  const geometry = isFeature(parsed) ? parsed.geometry : parsed;

  if (!isRecord(geometry) || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
    return null;
  }

  const coordinates = geometry.coordinates
    .map((point) => parseCoordinate(point))
    .filter((point): point is [number, number] => Boolean(point));

  if (coordinates.length < 2) {
    return null;
  }

  return {
    type: "LineString",
    coordinates,
  };
}

function parseCoordinate(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }

  const lng = parseBoundedCoordinate(value[0], { min: -180, max: 180 });
  const lat = parseBoundedCoordinate(value[1], { min: -90, max: 90 });
  if (lng == null || lat == null) {
    return null;
  }

  return [lng, lat];
}

function parseDifficulty(value: unknown): Difficulty | null {
  if (typeof value !== "string") {
    return null;
  }
  return DIFFICULTIES.has(value as Difficulty) ? (value as Difficulty) : null;
}

function parseSurfaceType(value: unknown): SurfaceType | null {
  if (typeof value !== "string") {
    return null;
  }
  return SURFACE_TYPES.has(value as SurfaceType) ? (value as SurfaceType) : null;
}

function parseTransportMode(value: unknown): TransportMode | null {
  if (typeof value !== "string") {
    return null;
  }
  return TRANSPORT_MODES.has(value as TransportMode) ? (value as TransportMode) : null;
}

function sanitizeId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function sanitizeName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, MAX_NAME_LENGTH);
}

function sanitizeOptionalName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized.slice(0, MAX_NAME_LENGTH) : undefined;
}

function sanitizeDescription(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized.slice(0, MAX_DESCRIPTION_LENGTH) : null;
}

function parseBoundedNumber(value: unknown, bounds: { min: number; max: number }): number | null {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < bounds.min || numericValue > bounds.max) {
    return null;
  }
  return numericValue;
}

function parseBoundedCoordinate(value: unknown, bounds: { min: number; max: number }): number | null {
  const numericValue = parseBoundedNumber(value, bounds);
  if (numericValue == null) {
    return null;
  }
  return Math.round(numericValue * COORDINATE_PRECISION_MULTIPLIER) / COORDINATE_PRECISION_MULTIPLIER;
}

function parseBoundedInteger(value: unknown, bounds: { min: number; max: number }): number | null {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue < bounds.min || numericValue > bounds.max) {
    return null;
  }
  return numericValue;
}

function hasDuplicateWaypoints(waypoints: CreateWaypointInput[]): boolean {
  const seen = new Set<string>();
  for (const waypoint of waypoints) {
    const key = formatCoordinateKey(waypoint.lat, waypoint.lng);
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  return false;
}

function formatCoordinateKey(lat: number, lng: number): string {
  return `${lat.toFixed(DUPLICATE_COORDINATE_PRECISION)},${lng.toFixed(DUPLICATE_COORDINATE_PRECISION)}`;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isFeature(value: unknown): value is Feature {
  return isRecord(value) && value.type === "Feature" && Boolean(value.geometry);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

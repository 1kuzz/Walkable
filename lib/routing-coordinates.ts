import type { Position } from "geojson";

export function isValidRoutePosition(point: Position | [number, number]): boolean {
  return Number.isFinite(point[0])
    && Number.isFinite(point[1])
    && point[0] >= -180
    && point[0] <= 180
    && point[1] >= -90
    && point[1] <= 90;
}

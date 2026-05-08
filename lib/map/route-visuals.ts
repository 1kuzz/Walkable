import type { RouteFeatureProperties } from "@/lib/geo";

export type RouteVisualMode = "default" | "builder";

export interface ResolvedRouteStyle {
  bodyColor: string;
  bodyOpacity: number;
  bodyWidth: number;
  casingColor: string;
  casingOpacity: number;
  casingWidth: number;
  casingBlur: number;
  highlightColor: string;
  highlightOpacity: number;
  highlightWidth: number;
  interactive: boolean;
}

const DEFAULT_BASE = {
  strokeColor: "#2563eb",
  strokeOpacity: 0.8,
  strokeWidth: 7,
  casingWidth: 14,
  casingOpacity: 0.25,
  casingBlur: 6,
  highlightColor: "#bfdbfe",
  highlightOpacity: 0.9,
  highlightWidth: 2,
};

const DEFAULT_ACTIVE = {
  strokeColor: "#f97316",
  strokeOpacity: 0.95,
  strokeWidth: 9,
  casingWidth: 16,
};

const BUILDER_DRAFT = {
  strokeOpacity: 0.98,
  strokeWidth: 10,
  casingWidth: 18,
  casingOpacity: 0.5,
  casingBlur: 8,
};

const BUILDER_COMMUNITY = {
  strokeOpacity: 0.35,
  strokeWidth: 4,
  casingWidth: 10,
  casingOpacity: 0.1,
  casingBlur: 4,
};

export function resolveRouteStyle({
  route,
  visualMode,
  routeColor,
  isActive,
  enableRouteSnapping,
}: {
  route: Pick<RouteFeatureProperties, "source">;
  visualMode: RouteVisualMode;
  routeColor?: string;
  isActive: boolean;
  enableRouteSnapping: boolean;
}): ResolvedRouteStyle {
  const source = route.source ?? "route";
  const isDraftLike = source === "draft" || source === "reroute";
  const isCommunity = source === "route";
  const interactive = enableRouteSnapping && isCommunity;
  const baseColor = routeColor ?? DEFAULT_BASE.strokeColor;

  if (visualMode === "builder") {
    if (isDraftLike) {
      return {
        bodyColor: routeColor ?? DEFAULT_ACTIVE.strokeColor,
        bodyOpacity: BUILDER_DRAFT.strokeOpacity,
        bodyWidth: BUILDER_DRAFT.strokeWidth,
        casingColor: routeColor ?? DEFAULT_ACTIVE.strokeColor,
        casingOpacity: BUILDER_DRAFT.casingOpacity,
        casingWidth: BUILDER_DRAFT.casingWidth,
        casingBlur: BUILDER_DRAFT.casingBlur,
        highlightColor: DEFAULT_BASE.highlightColor,
        highlightOpacity: 0,
        highlightWidth: 0,
        interactive: false,
      };
    }

    if (isCommunity) {
      return {
        bodyColor: isActive ? DEFAULT_ACTIVE.strokeColor : baseColor,
        bodyOpacity: isActive ? DEFAULT_ACTIVE.strokeOpacity : BUILDER_COMMUNITY.strokeOpacity,
        bodyWidth: isActive ? DEFAULT_ACTIVE.strokeWidth : BUILDER_COMMUNITY.strokeWidth,
        casingColor: isActive ? DEFAULT_ACTIVE.strokeColor : baseColor,
        casingOpacity: isActive ? 0.35 : BUILDER_COMMUNITY.casingOpacity,
        casingWidth: isActive ? DEFAULT_ACTIVE.casingWidth : BUILDER_COMMUNITY.casingWidth,
        casingBlur: BUILDER_COMMUNITY.casingBlur,
        highlightColor: DEFAULT_BASE.highlightColor,
        highlightOpacity: interactive && isActive ? 0.25 : 0,
        highlightWidth: interactive && isActive ? DEFAULT_BASE.highlightWidth : 0,
        interactive,
      };
    }
  }

  return {
    bodyColor: isActive ? DEFAULT_ACTIVE.strokeColor : baseColor,
    bodyOpacity: isActive ? DEFAULT_ACTIVE.strokeOpacity : DEFAULT_BASE.strokeOpacity,
    bodyWidth: isActive ? DEFAULT_ACTIVE.strokeWidth : DEFAULT_BASE.strokeWidth,
    casingColor: isActive ? DEFAULT_ACTIVE.strokeColor : baseColor,
    casingOpacity: isActive ? 0.35 : DEFAULT_BASE.casingOpacity,
    casingWidth: isActive ? DEFAULT_ACTIVE.casingWidth : DEFAULT_BASE.casingWidth,
    casingBlur: DEFAULT_BASE.casingBlur,
    highlightColor: DEFAULT_BASE.highlightColor,
    highlightOpacity: DEFAULT_BASE.highlightOpacity,
    highlightWidth: DEFAULT_BASE.highlightWidth,
    interactive,
  };
}

import type { Position } from "geojson";

declare global {
  interface Window {
    ymaps?: YandexMapsApi;
  }
}

type YandexEventHandler = (event: { get(name: string): unknown }) => void;

export interface YandexGeoObject {
  events: {
    add(name: string, handler: YandexEventHandler): void;
  };
  geometry?: {
    setCoordinates(coords: number[]): void;
  };
  options: {
    set(name: string, value: unknown): void;
  };
  balloon?: {
    close(): void;
  };
}

export interface YandexMap {
  events: {
    add(name: string, handler: YandexEventHandler): void;
    remove(name: string, handler: YandexEventHandler): void;
  };
  controls: {
    add(name: string, options?: Record<string, unknown>): void;
  };
  geoObjects: {
    add(object: YandexGeoObject): void;
    remove(object: YandexGeoObject): void;
  };
  setCenter(coords: number[], zoom?: number): void;
  setType(type: string): void;
  destroy(): void;
}

export interface YandexMultiRoute {
  model: {
    events: {
      add(name: string, handler: () => void): void;
      remove(name: string, handler: () => void): void;
    };
  };
  getActiveRoute(): {
    getPaths(): unknown;
    properties: {
      get(name: string): unknown;
    };
  } | null;
}

export interface YandexMapsApi {
  ready(callback: () => void): void;
  Map: new (
    container: HTMLElement,
    state: { center: number[]; zoom: number; type?: string },
    options?: Record<string, unknown>,
  ) => YandexMap;
  Placemark: new (
    coordinates: number[],
    properties?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => YandexGeoObject;
  Polyline: new (
    coordinates: number[][],
    properties?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => YandexGeoObject;
  multiRouter: {
    MultiRoute: new (
      model: {
        referencePoints: number[][];
        params?: Record<string, unknown>;
      },
      options?: Record<string, unknown>,
    ) => YandexMultiRoute;
  };
}

let yandexMapsPromise: Promise<YandexMapsApi | null> | null = null;

export function loadYandexMapsApi(): Promise<YandexMapsApi | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
  if (!apiKey) {
    return Promise.resolve(null);
  }

  if (window.ymaps) {
    return new Promise((resolve) => {
      window.ymaps?.ready(() => resolve(window.ymaps ?? null));
    });
  }

  if (yandexMapsPromise) {
    return yandexMapsPromise;
  }

  yandexMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-yandex-maps="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        window.ymaps?.ready(() => resolve(window.ymaps ?? null));
      }, { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Yandex Maps")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=en_US`;
    script.async = true;
    script.defer = true;
    script.dataset.yandexMaps = "true";
    script.onload = () => {
      window.ymaps?.ready(() => resolve(window.ymaps ?? null));
    };
    script.onerror = () => {
      yandexMapsPromise = null;
      reject(new Error("Failed to load Yandex Maps"));
    };
    document.head.appendChild(script);
  });

  return yandexMapsPromise;
}

export function getYandexMapType(style: "streets" | "satellite" | "terrain"): string {
  switch (style) {
    case "satellite":
      return "yandex#satellite";
    case "terrain":
      return "yandex#hybrid";
    default:
      return "yandex#map";
  }
}

export function toYandexCoordinates([lng, lat]: Position): number[] {
  return [lat, lng];
}

export function toGeoJsonCoordinates([lat, lng]: number[]): Position {
  return [lng, lat];
}

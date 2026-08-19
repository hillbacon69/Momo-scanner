import type { GeocodedWaypoint } from "../types/permit";

/**
 * Google's consumer Directions deep link caps how many waypoints it will
 * reliably honor. Beyond this, thin the middle waypoints out (keeping
 * the two endpoints) rather than truncating the destination away -
 * losing the destination would silently send the driver nowhere.
 */
const MAX_WAYPOINTS = 23; // + origin + destination = 25, Google's documented ceiling

export interface GoogleMapsLinkResult {
  url: string;
  waypointsIncluded: number;
  waypointsDropped: number;
}

function toLatLngParam(point: { latitude: number; longitude: number }): string {
  return `${point.latitude},${point.longitude}`;
}

function thinToLimit<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = items.length / max;
  const thinned: T[] = [];
  for (let i = 0; i < max; i++) {
    thinned.push(items[Math.floor(i * step)]);
  }
  return thinned;
}

/**
 * Builds a Google Maps directions deep link that passes through the
 * permit's waypoints in order. This is a fallback/secondary option, not
 * the primary navigation path: once handed off, Google Maps recalculates
 * its own route between each waypoint using its normal driving-directions
 * algorithm, which is not truck-aware and is not guaranteed to stay on
 * the exact roads the permit specifies between two consecutive waypoints.
 */
export function buildGoogleMapsDirectionsLink(
  waypoints: GeocodedWaypoint[]
): GoogleMapsLinkResult | null {
  const resolved = waypoints.filter((w) => w.matchQuality !== "unresolved");
  if (resolved.length < 2) return null;

  const origin = resolved[0];
  const destination = resolved[resolved.length - 1];
  const middle = resolved.slice(1, -1);
  const thinnedMiddle = thinToLimit(middle, MAX_WAYPOINTS);

  const params = new URLSearchParams({
    api: "1",
    origin: toLatLngParam(origin),
    destination: toLatLngParam(destination),
    travelmode: "driving",
  });

  if (thinnedMiddle.length > 0) {
    params.set("waypoints", thinnedMiddle.map(toLatLngParam).join("|"));
  }

  return {
    url: `https://www.google.com/maps/dir/?${params.toString()}`,
    waypointsIncluded: thinnedMiddle.length + 2,
    waypointsDropped: middle.length - thinnedMiddle.length,
  };
}

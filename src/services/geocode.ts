import type { GeocodedWaypoint, ParsedPermit, RouteStep } from "../types/permit";

const GEOCODE_ENDPOINT = "https://geocode.search.hereapi.com/v1/geocode";

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  label: string;
  /** HERE's own relevance score for the top match (0-1). */
  queryScore?: number;
}

interface HereGeocodeItem {
  title: string;
  resultType: string;
  address?: { label?: string };
  position: { lat: number; lng: number };
  scoring?: { queryScore?: number };
}

interface HereGeocodeResponse {
  items: HereGeocodeItem[];
}

/**
 * Geocodes a free-text query via HERE, optionally biased toward a
 * previous point in the route (`near`) so that e.g. "SH-6" resolves to
 * the SH-6 nearest the last waypoint rather than one in another part of
 * the state entirely.
 */
export async function geocodeQuery(
  query: string,
  apiKey: string,
  near?: { latitude: number; longitude: number }
): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    q: query,
    apiKey,
    in: "countryCode:USA",
    limit: "1",
  });
  if (near) {
    params.set("at", `${near.latitude},${near.longitude}`);
  }

  const response = await fetch(`${GEOCODE_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HERE geocoding failed (HTTP ${response.status}) for "${query}"`);
  }

  const data = (await response.json()) as HereGeocodeResponse;
  const top = data.items?.[0];
  if (!top) return null;

  return {
    latitude: top.position.lat,
    longitude: top.position.lng,
    label: top.address?.label ?? top.title,
    queryScore: top.scoring?.queryScore,
  };
}

/**
 * A step is worth turning into a routing waypoint if it has any
 * geocodable signal at all - a printed coordinate, a road, a junction/
 * named-exit landmark, or a local common name. Real permits (LA, TX)
 * print the route as a table where nearly every leg names a distinct
 * road, and forcing the calculated route through each of them in order
 * is exactly what keeps it on the permitted roads instead of whatever
 * Google/HERE would pick on their own.
 */
export function isWaypointCandidate(step: RouteStep): boolean {
  return Boolean(
    (step.presetLatitude !== undefined && step.presetLongitude !== undefined) ||
      step.landmark ||
      step.commonName ||
      step.road ||
      step.exitNumber
  );
}

/** Builds the free-text search query HERE is most likely to resolve for a given step. */
function buildQueryForStep(step: RouteStep, state?: string): string {
  const parts: string[] = [];
  if (step.landmark) parts.push(step.landmark);
  else if (step.commonName) parts.push(step.commonName);
  else if (step.road) parts.push(step.road);
  if (step.exitNumber) parts.push(`Exit ${step.exitNumber}`);
  if (parts.length === 0) parts.push(step.rawText);
  if (state) parts.push(state);
  return parts.join(", ");
}

export interface GeocodeProgress {
  completed: number;
  total: number;
  currentLabel: string;
}

/**
 * Geocodes the permit's decision-point steps in order, biasing each
 * lookup toward the previous resolved point so the chain stays coherent
 * along the actual route instead of jumping across the state.
 */
export async function geocodeRouteSteps(
  permit: ParsedPermit,
  apiKey: string,
  onProgress?: (progress: GeocodeProgress) => void
): Promise<GeocodedWaypoint[]> {
  const candidates = permit.steps.filter(isWaypointCandidate);
  const waypoints: GeocodedWaypoint[] = [];

  let near: { latitude: number; longitude: number } | undefined;

  // Bias the very first lookup toward the permit's stated origin, if any.
  if (permit.originLabel) {
    try {
      const origin = await geocodeQuery(
        `${permit.originLabel}${permit.state ? ", " + permit.state : ""}`,
        apiKey
      );
      if (origin) near = { latitude: origin.latitude, longitude: origin.longitude };
    } catch {
      // Non-fatal - fall through with no bias for the first real waypoint.
    }
  }

  for (let i = 0; i < candidates.length; i++) {
    const step = candidates[i];
    onProgress?.({ completed: i, total: candidates.length, currentLabel: step.rawText });

    // A coordinate printed directly on the permit is more trustworthy than
    // any address search - use it as-is and skip the network call.
    if (step.presetLatitude !== undefined && step.presetLongitude !== undefined) {
      near = { latitude: step.presetLatitude, longitude: step.presetLongitude };
      waypoints.push({
        step,
        latitude: step.presetLatitude,
        longitude: step.presetLongitude,
        matchQuality: "exact",
        resolvedLabel: "Printed on permit",
      });
      continue;
    }

    const query = buildQueryForStep(step, permit.state);
    let result: GeocodeResult | null = null;
    try {
      result = await geocodeQuery(query, apiKey, near);
    } catch {
      result = null;
    }

    if (result) {
      near = { latitude: result.latitude, longitude: result.longitude };
      waypoints.push({
        step,
        latitude: result.latitude,
        longitude: result.longitude,
        matchQuality:
          result.queryScore === undefined || result.queryScore >= 0.7
            ? "exact"
            : "approximate",
        resolvedLabel: result.label,
      });
    } else {
      waypoints.push({
        step,
        latitude: near?.latitude ?? 0,
        longitude: near?.longitude ?? 0,
        matchQuality: "unresolved",
      });
    }
  }

  onProgress?.({ completed: candidates.length, total: candidates.length, currentLabel: "" });

  return waypoints;
}

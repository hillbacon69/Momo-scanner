import { decodeFlexiblePolyline } from "../utils/flexiblePolyline";
import { haversineDistanceMeters, nearestPointOnPolyline } from "../utils/geo";
import type {
  GeocodedWaypoint,
  ManeuverAction,
  ManeuverInstruction,
  RoutePlan,
  TruckProfile,
} from "../types/permit";

const ROUTES_ENDPOINT = "https://router.hereapi.com/v8/routes";

/** How far (meters) a requested waypoint may sit from the calculated route before we warn the driver. */
const DEVIATION_WARNING_METERS = 300;

interface HereAction {
  action: string;
  duration: number;
  length: number;
  offset: number;
  instruction?: string;
  direction?: string;
}

interface HereSection {
  polyline: string;
  actions?: HereAction[];
  summary?: { length: number; duration: number };
}

interface HereRoutesResponse {
  routes: { sections: HereSection[] }[];
}

const HERE_ACTION_MAP: Record<string, ManeuverAction> = {
  depart: "start",
  arrive: "end",
  continue: "continue",
  merge: "merge",
  ramp: "exit",
  exit: "exit",
  uTurn: "u-turn",
  roundaboutEnter: "roundabout",
  roundaboutExit: "roundabout",
  roundaboutPass: "roundabout",
};

function mapAction(hereAction: HereAction): ManeuverAction {
  if (hereAction.action === "turn" || hereAction.action === "keep") {
    if (hereAction.direction === "left") {
      return hereAction.action === "keep" ? "keep-left" : "turn-left";
    }
    if (hereAction.direction === "right") {
      return hereAction.action === "keep" ? "keep-right" : "turn-right";
    }
  }
  return HERE_ACTION_MAP[hereAction.action] ?? "unknown";
}

/**
 * `truck[...]` vs `vehicle[...]` and centimeter/kilogram units are the
 * one part of the HERE v8 request this couldn't be verified against
 * live docs while offline - if the API rejects these params (HTTP 400)
 * the caller retries the request without them so a param-name mismatch
 * degrades to "no truck-profile constraints applied" rather than a hard
 * failure to route the permit at all.
 */
function buildVehicleParams(profile: TruckProfile): Record<string, string> {
  const params: Record<string, string> = {};
  if (profile.heightMeters) params["vehicle[height]"] = String(Math.round(profile.heightMeters * 100));
  if (profile.widthMeters) params["vehicle[width]"] = String(Math.round(profile.widthMeters * 100));
  if (profile.lengthMeters) params["vehicle[length]"] = String(Math.round(profile.lengthMeters * 100));
  if (profile.grossWeightKg) params["vehicle[grossWeight]"] = String(Math.round(profile.grossWeightKg));
  if (profile.axleCount) params["vehicle[axleCount]"] = String(profile.axleCount);
  return params;
}

async function requestRoute(
  waypoints: GeocodedWaypoint[],
  truckProfile: TruckProfile,
  apiKey: string,
  includeVehicleParams: boolean
): Promise<{ response: Response; usedVehicleParams: boolean }> {
  const resolved = waypoints.filter((w) => w.matchQuality !== "unresolved");
  const origin = resolved[0];
  const destination = resolved[resolved.length - 1];
  const via = resolved.slice(1, -1);

  const params = new URLSearchParams({
    transportMode: "truck",
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    return: "polyline,actions,instructions,summary",
    apiKey,
  });

  for (const point of via) {
    params.append("via", `${point.latitude},${point.longitude}!passThrough=true`);
  }

  if (includeVehicleParams) {
    for (const [key, value] of Object.entries(buildVehicleParams(truckProfile))) {
      params.set(key, value);
    }
  }

  const response = await fetch(`${ROUTES_ENDPOINT}?${params.toString()}`);
  return { response, usedVehicleParams: includeVehicleParams };
}

export interface RouteBuildWarning {
  code: "truck-profile-not-applied" | "waypoint-deviation" | "unresolved-waypoints";
  message: string;
}

export interface RouteBuildResult {
  polyline: RoutePlan["polyline"];
  maneuvers: ManeuverInstruction[];
  distanceMeters: number;
  durationSeconds: number;
  warnings: RouteBuildWarning[];
}

export async function buildRouteFromWaypoints(
  waypoints: GeocodedWaypoint[],
  truckProfile: TruckProfile,
  apiKey: string
): Promise<RouteBuildResult> {
  const resolvedCount = waypoints.filter((w) => w.matchQuality !== "unresolved").length;
  if (resolvedCount < 2) {
    throw new Error(
      "Not enough waypoints on this route could be located to calculate a path. Review and edit the route steps, or fill in the missing locations manually."
    );
  }

  const warnings: RouteBuildWarning[] = [];
  if (resolvedCount < waypoints.length) {
    warnings.push({
      code: "unresolved-waypoints",
      message: `${waypoints.length - resolvedCount} waypoint(s) on the permit couldn't be located and were skipped when building the route. Double-check the route against the printed permit.`,
    });
  }

  const hasTruckProfile = Object.keys(buildVehicleParams(truckProfile)).length > 0;
  let { response, usedVehicleParams } = await requestRoute(
    waypoints,
    truckProfile,
    apiKey,
    hasTruckProfile
  );

  if (!response.ok && usedVehicleParams) {
    // Likely a vehicle-param naming/format mismatch - retry without them
    // rather than failing to route the permit entirely.
    ({ response, usedVehicleParams } = await requestRoute(waypoints, truckProfile, apiKey, false));
    if (response.ok) {
      warnings.push({
        code: "truck-profile-not-applied",
        message:
          "Couldn't apply the truck's dimensions/weight to the routing request, so height/weight restrictions were not double-checked by the routing engine. Follow the permit's printed route exactly.",
      });
    }
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HERE routing request failed (HTTP ${response.status}). ${body}`.trim());
  }

  const data = (await response.json()) as HereRoutesResponse;
  const section = data.routes?.[0]?.sections?.[0];
  if (!section) {
    throw new Error("HERE returned no route for this permit's waypoints.");
  }

  const polyline = decodeFlexiblePolyline(section.polyline);

  const maneuvers: ManeuverInstruction[] = (section.actions ?? []).map((action, index, all) => {
    const point = polyline[action.offset] ?? polyline[polyline.length - 1];
    const next = all[index + 1];
    const distanceToNextMeters =
      next && polyline[next.offset]
        ? cumulativeDistance(polyline, action.offset, next.offset)
        : action.length;

    return {
      index,
      instruction: action.instruction ?? describeFallbackInstruction(action),
      action: mapAction(action),
      latitude: point.latitude,
      longitude: point.longitude,
      polylineIndex: action.offset,
      distanceToNextMeters,
    };
  });

  for (const wp of waypoints) {
    if (wp.matchQuality === "unresolved") continue;
    const nearest = nearestPointOnPolyline(
      { latitude: wp.latitude, longitude: wp.longitude },
      polyline
    );
    if (nearest && nearest.distanceMeters > DEVIATION_WARNING_METERS) {
      warnings.push({
        code: "waypoint-deviation",
        message: `The calculated route passes ${Math.round(
          nearest.distanceMeters
        )}m from "${wp.step.rawText}" - it may not follow the permit exactly. Review this step.`,
      });
    }
  }

  return {
    polyline,
    maneuvers,
    distanceMeters: section.summary?.length ?? 0,
    durationSeconds: section.summary?.duration ?? 0,
    warnings,
  };
}

function cumulativeDistance(
  polyline: RoutePlan["polyline"],
  fromIndex: number,
  toIndex: number
): number {
  let total = 0;
  for (let i = fromIndex; i < toIndex && i < polyline.length - 1; i++) {
    total += haversineDistanceMeters(polyline[i], polyline[i + 1]);
  }
  return total;
}

function describeFallbackInstruction(action: HereAction): string {
  switch (action.action) {
    case "depart":
      return "Start";
    case "arrive":
      return "Arrive at destination";
    case "turn":
      return action.direction === "left" ? "Turn left" : "Turn right";
    case "keep":
      return action.direction === "left" ? "Keep left" : "Keep right";
    case "merge":
      return "Merge";
    case "ramp":
    case "exit":
      return "Take the exit";
    case "uTurn":
      return "Make a U-turn";
    default:
      return "Continue";
  }
}

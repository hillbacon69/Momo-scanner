import {
  haversineDistanceMeters,
  nearestPointOnPolyline,
  type LatLng,
} from "../utils/geo";
import type { ManeuverInstruction } from "../types/permit";

/** Distance (meters) beyond which the driver is considered off the calculated route. */
const OFF_ROUTE_METERS = 80;
/** Consecutive off-route fixes required before raising the warning, to ignore single noisy GPS fixes. */
const OFF_ROUTE_CONFIRM_COUNT = 3;

/** Announce an upcoming maneuver when its distance crosses below each of these, nearest-first is announced last. */
const ANNOUNCE_THRESHOLDS_METERS = [1609, 804, 402, 152] as const; // 1mi, 0.5mi, 0.25mi, 500ft

export interface NavigationState {
  currentManeuverIndex: number;
  upcomingManeuver: ManeuverInstruction | null;
  distanceToNextManeuverMeters: number;
  distanceRemainingMeters: number;
  offRoute: boolean;
  offRouteDistanceMeters: number;
}

export interface NavigationEngineOptions {
  polyline: LatLng[];
  maneuvers: ManeuverInstruction[];
  speak: (text: string) => void;
  onStateChange?: (state: NavigationState) => void;
}

function formatThreshold(meters: number): string {
  if (meters >= 1609) return "1 mile";
  if (meters >= 804) return "half a mile";
  if (meters >= 402) return "a quarter mile";
  return "500 feet";
}

function distanceToVertexAlongRoute(
  polyline: LatLng[],
  fromSegmentIndex: number,
  fromFraction: number,
  toVertexIndex: number
): number {
  if (toVertexIndex <= fromSegmentIndex) return 0;
  const segStart = polyline[fromSegmentIndex];
  const segEnd = polyline[fromSegmentIndex + 1];
  let total = segStart && segEnd
    ? haversineDistanceMeters(segStart, segEnd) * (1 - fromFraction)
    : 0;
  for (let i = fromSegmentIndex + 1; i < toVertexIndex && i < polyline.length - 1; i++) {
    total += haversineDistanceMeters(polyline[i], polyline[i + 1]);
  }
  return total;
}

/**
 * Tracks GPS progress against a calculated route and drives voice
 * guidance. Deliberately does NOT auto-reroute on deviation - for a
 * permitted oversize load, silently recalculating a "convenient" path
 * could route the driver onto a road the permit doesn't cover. Going
 * off-route just raises a flag; recalculation is a driver-initiated
 * action handled by the caller (which re-runs routing through the
 * permit's original waypoints from the new position).
 */
export class NavigationEngine {
  private polyline: LatLng[];
  private maneuvers: ManeuverInstruction[];
  private speak: (text: string) => void;
  private onStateChange?: (state: NavigationState) => void;

  private currentManeuverIndex = 0;
  private announcedThresholds = new Set<number>();
  private offRouteStrikes = 0;
  private offRoute = false;

  constructor(options: NavigationEngineOptions) {
    this.polyline = options.polyline;
    this.maneuvers = options.maneuvers;
    this.speak = options.speak;
    this.onStateChange = options.onStateChange;
  }

  reset(): void {
    this.currentManeuverIndex = 0;
    this.announcedThresholds.clear();
    this.offRouteStrikes = 0;
    this.offRoute = false;
  }

  handlePositionUpdate(position: LatLng): NavigationState {
    const nearest = nearestPointOnPolyline(position, this.polyline);

    if (!nearest || this.polyline.length < 2) {
      const state: NavigationState = {
        currentManeuverIndex: this.currentManeuverIndex,
        upcomingManeuver: this.maneuvers[this.currentManeuverIndex] ?? null,
        distanceToNextManeuverMeters: 0,
        distanceRemainingMeters: 0,
        offRoute: this.offRoute,
        offRouteDistanceMeters: 0,
      };
      this.onStateChange?.(state);
      return state;
    }

    if (nearest.distanceMeters > OFF_ROUTE_METERS) {
      this.offRouteStrikes += 1;
      if (this.offRouteStrikes >= OFF_ROUTE_CONFIRM_COUNT && !this.offRoute) {
        this.offRoute = true;
        this.speak("You are off the permitted route. Return to the route and recalculate if needed.");
      }
    } else {
      this.offRouteStrikes = 0;
      this.offRoute = false;
    }

    // Advance past any maneuvers whose vertex we've already reached.
    while (
      this.currentManeuverIndex + 1 < this.maneuvers.length &&
      this.maneuvers[this.currentManeuverIndex + 1].polylineIndex <= nearest.segmentIndex
    ) {
      this.currentManeuverIndex += 1;
      this.announcedThresholds.clear();
    }

    const upcoming = this.maneuvers[this.currentManeuverIndex + 1] ?? null;
    const distanceToNextManeuverMeters = upcoming
      ? distanceToVertexAlongRoute(
          this.polyline,
          nearest.segmentIndex,
          nearest.fractionAlongSegment,
          upcoming.polylineIndex
        )
      : 0;

    if (upcoming) {
      this.maybeAnnounce(upcoming, distanceToNextManeuverMeters);
    }

    const distanceRemainingMeters = distanceToVertexAlongRoute(
      this.polyline,
      nearest.segmentIndex,
      nearest.fractionAlongSegment,
      this.polyline.length - 1
    );

    const state: NavigationState = {
      currentManeuverIndex: this.currentManeuverIndex,
      upcomingManeuver: upcoming,
      distanceToNextManeuverMeters,
      distanceRemainingMeters,
      offRoute: this.offRoute,
      offRouteDistanceMeters: this.offRoute ? nearest.distanceMeters : 0,
    };
    this.onStateChange?.(state);
    return state;
  }

  private maybeAnnounce(upcoming: ManeuverInstruction, distanceMeters: number): void {
    // Thresholds are ordered largest-to-smallest. If several were crossed
    // between two GPS fixes (e.g. a gap in updates), only speak the
    // closest one - not a burst of "in 1 mile... in half a mile...".
    const satisfied = ANNOUNCE_THRESHOLDS_METERS.filter(
      (threshold) => distanceMeters <= threshold && !this.announcedThresholds.has(threshold)
    );
    if (satisfied.length === 0) return;

    for (const threshold of satisfied) this.announcedThresholds.add(threshold);
    const closest = satisfied[satisfied.length - 1];
    const phrase =
      closest === 152
        ? upcoming.instruction
        : `In ${formatThreshold(closest)}, ${lowerFirst(upcoming.instruction)}`;
    this.speak(phrase);
  }
}

function lowerFirst(text: string): string {
  return text.length > 0 ? text[0].toLowerCase() + text.slice(1) : text;
}

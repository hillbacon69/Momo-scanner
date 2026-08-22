// Core domain types for parsing an oversize/overweight load permit
// and turning its printed route into navigable waypoints.

export type USState = "LA" | "TX" | "NM" | "OK" | (string & {});

export interface TruckProfile {
  /** Overall vehicle height in meters, if known from the permit. */
  heightMeters?: number;
  /** Overall vehicle width in meters, if known from the permit. */
  widthMeters?: number;
  /** Overall vehicle length in meters, if known from the permit. */
  lengthMeters?: number;
  /** Gross weight in kilograms, if known from the permit. */
  grossWeightKg?: number;
  /** Number of axles, if known from the permit. */
  axleCount?: number;
}

export type ManeuverAction =
  | "start"
  | "continue"
  | "turn-left"
  | "turn-right"
  | "keep-left"
  | "keep-right"
  | "merge"
  | "exit"
  | "roundabout"
  | "u-turn"
  | "end"
  | "unknown";

/**
 * A single instruction as printed on the permit, before geocoding.
 * `confidence` reflects how sure the regex parser is about having
 * correctly understood this line - low-confidence steps should be
 * highlighted for manual review since misreading a permit route is
 * a legal/safety issue, not just a UX one.
 */
export interface RouteStep {
  id: string;
  /** Original text as it appeared on the permit (or as typed by the user). */
  rawText: string;
  action: ManeuverAction;
  /** Road name/identifier this step travels on or turns onto, e.g. "I-10", "US-190", "LOOP 375". */
  road?: string;
  /** Compass direction of travel for this step, if stated. */
  direction?: "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW";
  /** Distance for this leg, if stated on the permit. */
  distanceMiles?: number;
  /** Mile marker / milepost referenced, if stated. */
  mileMarker?: number;
  /** Exit number referenced, if stated. */
  exitNumber?: string;
  /** Free-text landmark/intersection used for geocoding, e.g. "JCT US-84 & SH-114". */
  landmark?: string;
  /** A local/common street name printed alongside the road code, e.g. "[WEST TEXAS AVENUE]" for US-80 - often geocodes better than the route code alone. */
  commonName?: string;
  /**
   * Coordinates printed directly on the permit for this step (some states,
   * e.g. Louisiana, print "[lat,lng]" for the route's start/end points).
   * When present, geocoding is skipped entirely for this step - a printed
   * coordinate is more trustworthy than any address search.
   */
  presetLatitude?: number;
  presetLongitude?: number;
  confidence: "high" | "medium" | "low";
}

export interface GeocodedWaypoint {
  step: RouteStep;
  latitude: number;
  longitude: number;
  /** How the geocoder resolved this point - useful to surface in the review UI. */
  matchQuality: "exact" | "approximate" | "unresolved";
  resolvedLabel?: string;
}

export interface ParsedPermit {
  permitNumber?: string;
  state?: USState;
  originLabel?: string;
  destinationLabel?: string;
  effectiveDate?: string;
  expirationDate?: string;
  truckProfile: TruckProfile;
  steps: RouteStep[];
  /** Full raw text the parser worked from, kept for the "view original" screen. */
  sourceText: string;
  /** Where the raw text came from. */
  sourceType: "qr-text" | "qr-url" | "manual";
  sourceUrl?: string;
}

export interface ManeuverInstruction {
  index: number;
  instruction: string;
  action: ManeuverAction;
  latitude: number;
  longitude: number;
  /** Index into RoutePlan.polyline where this maneuver occurs - lets the nav engine track progress by vertex instead of re-geocoding. */
  polylineIndex: number;
  /** Distance in meters from this maneuver to the next one along the route. */
  distanceToNextMeters: number;
}

export interface RoutePlan {
  permit: ParsedPermit;
  waypoints: GeocodedWaypoint[];
  /** Decoded route geometry, in order, from the routing engine. */
  polyline: { latitude: number; longitude: number }[];
  maneuvers: ManeuverInstruction[];
  distanceMeters: number;
  durationSeconds: number;
  /** True if the routing engine had to deviate meaningfully from the requested waypoints. */
  hasDeviationWarning: boolean;
}

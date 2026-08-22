import type {
  ManeuverAction,
  ParsedPermit,
  RouteStep,
  TruckProfile,
  USState,
} from "../types/permit";

/**
 * Heuristic parser for the "designated route" section of an oversize/
 * overweight load permit. Tuned against real LA DOTD and TX DMV permit
 * samples, which both print the route as a table of legs (distance +
 * road, sometimes with a "turn/continue/arrive" instruction cell) rather
 * than narrative sentences - so this looks for road identifiers and leg
 * distances first, with narrative action verbs (BEGIN/TURN LEFT/etc.)
 * layered on top for permits that do use prose. It marks its own
 * confidence per line and never silently drops a line it doesn't
 * understand, because a dropped turn is a missed turn - anything
 * uncertain surfaces as a low-confidence step for the driver to review
 * or edit before a route is built from it.
 */

// Covers both narrative-style codes (I-10, US-190, LA-169) and TxDMV's
// concatenated/zero-padded codes (IH20, US0080, SL0390, IH20NBFR).
const ROAD_PATTERN =
  /\b(IH|BUS(?:INESS)?|BU|LOOP|SPUR|SL|SS|US|SH|FM|RM|PR|LA|NM|OK|CR|I)-?\s?\d{1,4}[A-Z]{0,4}\b/i;
const ROAD_PATTERN_GLOBAL = new RegExp(ROAD_PATTERN.source, "gi");

const DIRECTION_PATTERN =
  /\b(NORTHEAST|NORTHWEST|SOUTHEAST|SOUTHWEST|NORTH|SOUTH|EAST|WEST|NE|NW|SE|SW|N|S|E|W)\b/i;

/** Direction printed as a lowercase single letter right after a road code, e.g. "US0080 e". */
const DIRECTION_AFTER_ROAD_PATTERN = /^\s+(NE|NW|SE|SW|N|S|E|W)\b/i;

const DIRECTION_MAP: Record<string, RouteStep["direction"]> = {
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
  NORTHEAST: "NE",
  NORTHWEST: "NW",
  SOUTHEAST: "SE",
  SOUTHWEST: "SW",
  N: "N",
  S: "S",
  E: "E",
  W: "W",
  NE: "NE",
  NW: "NW",
  SE: "SE",
  SW: "SW",
};

const DISTANCE_WITH_UNIT_PATTERN = /(\d+(?:\.\d+)?)\s*(?:MI\.?|MILES?)\b/i;
/** Table rows often print a bare leading number with no "mi" suffix, e.g. "4.3   US-80". */
const LEADING_NUMBER_PATTERN = /^\s*(\d+(?:\.\d+)?)\b/;

const MILE_MARKER_PATTERN =
  /\bMILE\s?POST\s+(\d+(?:\.\d+)?)\b|\bM\.?P\.?\s*#?\s*(\d+(?:\.\d+)?)\b|\bM\.?M\.?\s*#?\s*(\d+(?:\.\d+)?)\b/i;

const EXIT_NUMBER_PATTERN = /\bEXIT\s+#?\s*(\d+[A-Z]?)\b/i;
/** Named exits with no number, e.g. "NORWOOD EXIT". */
const NAMED_EXIT_PATTERN = /\b([A-Z][A-Z]{2,30}(?:\s+[A-Z]{2,30}){0,3})\s+EXIT\b/;

const LANDMARK_PATTERN =
  /\bJCT\.?\s+(.+)$|\bJUNCTION\s+(?:OF\s+)?(.+)$|\bINTERSECTION\s+(?:OF\s+)?(.+)$/i;

/** "[32.470237,-94.042496]" - LA permits print exact coordinates for route start/end points. */
const COORDINATE_PATTERN = /\[\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*\]/;
/** A bracketed local/common street name, e.g. "[WEST TEXAS AVENUE]" - distinct from a coordinate bracket. */
const COMMON_NAME_PATTERN = /\[\s*([A-Z][A-Z0-9 .'-]{2,40})\s*\]/;

/** Lines that are clearly route directions, in rough priority order. */
const ACTION_RULES: { pattern: RegExp; action: ManeuverAction }[] = [
  { pattern: /\b(BEGIN|START)\b/i, action: "start" },
  { pattern: /\b(END|ARRIVE|TERMINATE|DESTINATION\s+REACHED)\b/i, action: "end" },
  { pattern: /\bU-?TURN\b/i, action: "u-turn" },
  { pattern: /\bROUNDABOUT\b|\bTRAFFIC\s+CIRCLE\b/i, action: "roundabout" },
  { pattern: /\bTURN\s+LEFT\b|\bLEFT\s+TURN\b/i, action: "turn-left" },
  { pattern: /\bTURN\s+RIGHT\b|\bRIGHT\s+TURN\b/i, action: "turn-right" },
  { pattern: /\bKEEP\s+LEFT\b|\bBEAR\s+LEFT\b/i, action: "keep-left" },
  { pattern: /\bKEEP\s+RIGHT\b|\bBEAR\s+RIGHT\b/i, action: "keep-right" },
  { pattern: /\bMERGE\b/i, action: "merge" },
  { pattern: /\bEXIT\b/i, action: "exit" },
  {
    pattern: /\b(PROCEED|CONTINUE|TRAVEL|GO|CROSS|FOLLOW|STAY\s+ON|REMAIN\s+ON)\b/i,
    action: "continue",
  },
];

/** Lines worth ignoring outright when scanning for route steps. */
const BOILERPLATE_PATTERN =
  /^(PERMIT\s*(NO|NUMBER|#)|EFFECTIVE|EXPIR|ISSUED|DIMENSIONS?|HEIGHT|WIDTH|LENGTH|WEIGHT|AXLE|ESCORT|WARNING|NOTICE|VIOLATION|THIS\s+PERMIT|CONDITIONS?|RESTRICTIONS?|CONTACT|PHONE|FAX|SIGNATURE|DATE\s+ISSUED|FEE|\$|#\d)/i;

let stepIdCounter = 0;
function nextStepId(): string {
  stepIdCounter += 1;
  return `step-${Date.now()}-${stepIdCounter}`;
}

function feetInchesToMeters(feet: number, inches = 0): number {
  return (feet * 12 + inches) * 0.0254;
}

function lbsToKg(lbs: number): number {
  return lbs / 2.20462;
}

/**
 * Normalizes a matched road token to the form drivers/geocoders actually
 * recognize: strips TxDMV's zero-padding and concatenation ("US0080" ->
 * "US-80"), drops frontage-road direction suffixes that don't help
 * geocoding ("IH20NBFR" -> "I-20"), and expands short codes to the name
 * commonly used on the ground ("SL0390" -> "LOOP 390").
 */
function normalizeRoad(raw: string): string {
  const compact = raw.toUpperCase().replace(/\s+/g, "").replace(/^BUSINESS/, "BUS");
  const withoutFrontage = compact.replace(/(NB|SB|EB|WB)?FR$/, "");

  const match = withoutFrontage.match(/^([A-Z]{1,5}?)-?(\d{1,5})([A-Z]{0,3})$/);
  if (!match) return raw.toUpperCase().trim();

  const [, prefixRaw, digitsRaw, suffix] = match;
  const digits = String(parseInt(digitsRaw, 10));

  const prefixMap: Record<string, string> = {
    IH: "I",
    I: "I",
    US: "US",
    SH: "SH",
    FM: "FM",
    RM: "RM",
    PR: "PARK RD",
    SL: "LOOP",
    LOOP: "LOOP",
    SS: "SPUR",
    SPUR: "SPUR",
    BU: "BUS",
    BUS: "BUS",
    LA: "LA",
    NM: "NM",
    OK: "OK",
    CR: "CR",
  };
  const prefix = prefixMap[prefixRaw] ?? prefixRaw;
  const spacedPrefixes = new Set(["FM", "RM", "LOOP", "SPUR", "BUS", "PARK RD"]);
  const separator = spacedPrefixes.has(prefix) ? " " : "-";

  return `${prefix}${separator}${digits}${suffix ? " " + suffix : ""}`.trim();
}

function looksLikeRouteLine(line: string): boolean {
  if (line.length < 3) return false;
  if (BOILERPLATE_PATTERN.test(line.trim())) return false;

  const hasNumberedPrefix = /^\s*(\d{1,2}\.(?!\d)|\d{1,2}\)|STEP\s+\d+)/i.test(line);
  const hasActionVerb = ACTION_RULES.some((rule) => rule.pattern.test(line));
  const hasRoad = ROAD_PATTERN.test(line);
  const hasNamedExit = NAMED_EXIT_PATTERN.test(line);
  const hasCoordinate = COORDINATE_PATTERN.test(line);
  // A bare leg row like "4.3   US-80" - a leading distance plus nothing else recognizable
  // is still worth surfacing at low confidence rather than silently dropped.
  const looksLikeLegRow = LEADING_NUMBER_PATTERN.test(line) && line.trim().split(/\s+/).length <= 6;

  return (
    hasNumberedPrefix || hasActionVerb || hasRoad || hasNamedExit || hasCoordinate || looksLikeLegRow
  );
}

function classifyAction(line: string): ManeuverAction {
  for (const rule of ACTION_RULES) {
    if (rule.pattern.test(line)) return rule.action;
  }
  return "unknown";
}

function extractDirection(line: string, roadEndIndex?: number): RouteStep["direction"] | undefined {
  if (roadEndIndex !== undefined) {
    const afterRoad = line.slice(roadEndIndex).match(DIRECTION_AFTER_ROAD_PATTERN);
    if (afterRoad) return DIRECTION_MAP[afterRoad[1].toUpperCase()];
  }
  const match = line.match(DIRECTION_PATTERN);
  return match ? DIRECTION_MAP[match[1].toUpperCase()] : undefined;
}

function extractRoads(line: string): { text: string; index: number }[] {
  const matches: { text: string; index: number }[] = [];
  for (const m of line.matchAll(ROAD_PATTERN_GLOBAL)) {
    if (m.index === undefined) continue;
    matches.push({ text: normalizeRoad(m[0]), index: m.index + m[0].length });
  }
  return matches;
}

function extractDistanceMiles(line: string): number | undefined {
  const withUnit = line.match(DISTANCE_WITH_UNIT_PATTERN);
  if (withUnit) return parseFloat(withUnit[1]);
  const leading = line.match(LEADING_NUMBER_PATTERN);
  return leading ? parseFloat(leading[1]) : undefined;
}

function extractMileMarker(line: string): number | undefined {
  const match = line.match(MILE_MARKER_PATTERN);
  if (!match) return undefined;
  const raw = match[1] ?? match[2] ?? match[3];
  return raw ? parseFloat(raw) : undefined;
}

function extractExitNumber(line: string): string | undefined {
  const match = line.match(EXIT_NUMBER_PATTERN);
  return match ? match[1].toUpperCase() : undefined;
}

function extractLandmark(line: string, roads: { text: string }[]): string | undefined {
  const jctMatch = line.match(LANDMARK_PATTERN);
  if (jctMatch) {
    const text = (jctMatch[1] ?? jctMatch[2] ?? jctMatch[3] ?? "").trim();
    if (text.length > 0) return text.replace(/[.;]\s*$/, "");
  }

  const namedExit = line.match(NAMED_EXIT_PATTERN);
  if (namedExit) return `${namedExit[1].trim()} EXIT`;

  // Two different roads mentioned in the same line (e.g. "Turn left with
  // US0080" while currently on SL0390) - describe it as a junction, which
  // geocodes far more precisely than either road alone.
  if (roads.length >= 2 && roads[0].text !== roads[1].text) {
    return `${roads[0].text} & ${roads[1].text}`;
  }

  return undefined;
}

function extractCoordinate(line: string): { latitude: number; longitude: number } | undefined {
  const match = line.match(COORDINATE_PATTERN);
  if (!match) return undefined;
  return { latitude: parseFloat(match[1]), longitude: parseFloat(match[2]) };
}

function extractCommonName(line: string): string | undefined {
  // Don't confuse a coordinate bracket for a common-name bracket.
  if (COORDINATE_PATTERN.test(line)) {
    const withoutCoordinate = line.replace(COORDINATE_PATTERN, "");
    const match = withoutCoordinate.match(COMMON_NAME_PATTERN);
    return match ? match[1].trim() : undefined;
  }
  const match = line.match(COMMON_NAME_PATTERN);
  return match ? match[1].trim() : undefined;
}

function classifyStep(rawLine: string): RouteStep {
  const line = rawLine
    .replace(/^\s*(\d{1,2}\.(?!\d)|\d{1,2}\)|STEP\s+\d+[:.]?)\s*/i, "")
    .trim();

  let action = classifyAction(line);
  const roads = extractRoads(line);
  const road = roads[0]?.text;
  const direction = extractDirection(line, roads[0]?.index);
  const distanceMiles = extractDistanceMiles(line);
  const mileMarker = extractMileMarker(line);
  const exitNumber = extractExitNumber(line);
  const landmark = extractLandmark(line, roads);
  const coordinate = extractCoordinate(line);
  const commonName = extractCommonName(line);

  // A table row with a road and no verb (LA/TX leg-table format) still
  // represents a real leg of the route - treat it as "continue on this road"
  // rather than leaving it unclassified.
  if (action === "unknown" && (road || commonName)) {
    action = "continue";
  }

  let confidence: RouteStep["confidence"] = "low";
  if (coordinate || (action !== "unknown" && (road || landmark || exitNumber || commonName))) {
    confidence = "high";
  } else if (action !== "unknown" || road) {
    confidence = "medium";
  }

  return {
    id: nextStepId(),
    rawText: rawLine.trim(),
    action,
    road,
    direction,
    distanceMiles,
    mileMarker,
    exitNumber,
    landmark,
    commonName,
    presetLatitude: coordinate?.latitude,
    presetLongitude: coordinate?.longitude,
    confidence,
  };
}

/** Re-runs the classifier against edited text while keeping the step's identity, for the review/edit screen. */
export function reclassifyStepText(id: string, rawText: string): RouteStep {
  return { ...classifyStep(rawText), id };
}

export function createBlankStep(): RouteStep {
  return {
    id: nextStepId(),
    rawText: "",
    action: "unknown",
    confidence: "low",
  };
}

/**
 * A row like "EXIT 11" with no road of its own (common right after a
 * highway leg row) implicitly means "exit off the road just traveled" -
 * forward-fill it so the step has something to geocode against instead
 * of an ambiguous bare exit number.
 */
function attachContextualRoad(steps: RouteStep[]): RouteStep[] {
  let lastRoad: string | undefined;
  return steps.map((step) => {
    if (step.road) {
      lastRoad = step.road;
      return step;
    }
    if (step.exitNumber && lastRoad) {
      return { ...step, road: lastRoad };
    }
    return step;
  });
}

export function parseRouteSteps(sourceText: string): RouteStep[] {
  const lines = sourceText
    .split(/\r?\n/)
    .flatMap((line) =>
      // Some permits pack multiple steps into one paragraph separated by
      // periods after a numbered list collapses onto one line; split on
      // sentence boundaries that are followed by another numbered/verb start.
      line.split(/(?<=[.;])\s+(?=\d{1,2}[.)]\s|[A-Z]{4,})/)
    )
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const steps = lines.filter(looksLikeRouteLine).map(classifyStep);
  return attachContextualRoad(steps);
}

function extractPermitNumber(text: string): string | undefined {
  const match = text.match(/\bPERMIT\s*(?:NO\.?|NUMBER|#)\s*[:#]?\s*([A-Z0-9-]{4,20})/i);
  return match ? match[1].toUpperCase() : undefined;
}

function extractState(text: string): USState | undefined {
  const upper = text.toUpperCase();
  if (/\bLOUISIANA\b|\bLA\s*DOTD\b|\bDOTD\b/.test(upper)) return "LA";
  if (/\bTEXAS\b|\bTXDMV\b|\bTXDOT\b/.test(upper)) return "TX";
  if (/\bNEW\s+MEXICO\b|\bNMDOT\b/.test(upper)) return "NM";
  if (/\bOKLAHOMA\b|\bODOT\b/.test(upper)) return "OK";
  return undefined;
}

function extractOriginDestination(
  text: string
): { originLabel?: string; destinationLabel?: string } {
  // LA-style: "Origin: US-80 @ TX State Line [32.47,-94.04]  Destination: ... [31.81,-93.70]"
  const originDest = text.match(
    /\bORIGIN\s*:?\s*([^\n]+?)\s+DESTINATION\s*:?\s*([^\n]+)/i
  );
  if (originDest) {
    return { originLabel: originDest[1].trim(), destinationLabel: originDest[2].trim() };
  }

  const singleLine = text.match(/\bFROM\s*:?\s*([^\n]+?)\s+TO\s*:?\s*([^\n]+)/i);
  if (singleLine) {
    return {
      originLabel: singleLine[1].trim(),
      destinationLabel: singleLine[2].trim().split(/\s{2,}|\t/)[0].trim(),
    };
  }

  const origin = text.match(/\bORIGIN\s*:?\s*([^\n]+)/i);
  const destination = text.match(/\b(?:FINAL\s+)?DESTINATION\s*:?\s*([^\n]+)/i);
  return {
    originLabel: origin?.[1]?.trim(),
    destinationLabel: destination?.[1]?.trim(),
  };
}

function extractTruckProfile(text: string): TruckProfile {
  const profile: TruckProfile = {};

  // Feet/inches show up as "14' 6"", "14 FT 6 IN", or (LA's form) "14-8".
  const FEET_INCHES = /(\d+)\s*(?:FT\.?|'|-)\s*(\d+)?\s*(?:IN\.?|")?/;

  const height = text.match(new RegExp(String.raw`\bHEIGHT\s*[:=]?\s*${FEET_INCHES.source}`, "i"));
  if (height) {
    profile.heightMeters = feetInchesToMeters(
      parseInt(height[1], 10),
      height[2] ? parseInt(height[2], 10) : 0
    );
  }

  const width = text.match(new RegExp(String.raw`\bWIDTH\s*[:=]?\s*${FEET_INCHES.source}`, "i"));
  if (width) {
    profile.widthMeters = feetInchesToMeters(
      parseInt(width[1], 10),
      width[2] ? parseInt(width[2], 10) : 0
    );
  }

  const length = text.match(
    new RegExp(String.raw`\b(?:OVERALL\s+)?LENGTH\s*[:=]?\s*${FEET_INCHES.source}`, "i")
  );
  if (length) {
    profile.lengthMeters = feetInchesToMeters(
      parseInt(length[1], 10),
      length[2] ? parseInt(length[2], 10) : 0
    );
  }

  const weight = text.match(
    /\b(?:GROSS\s+WEIGHT|GVW|WEIGHT)\s*[:=]?\s*([\d,]+)\s*(?:LBS?\.?)?/i
  );
  if (weight) {
    profile.grossWeightKg = lbsToKg(parseInt(weight[1].replace(/,/g, ""), 10));
  }

  // Try "Axles: 8" (label before number, LA's form) before falling back to
  // "8 AXLES" - the reverse order risks a greedy whitespace match jumping
  // across an unrelated preceding number (e.g. a weight figure).
  const axles = text.match(/\bAXLES?\s*[:=]?\s*(\d+)\b/i) ?? text.match(/\b(\d+)\s*AXLES?\b/i);
  if (axles) {
    profile.axleCount = parseInt(axles[1], 10);
  }

  return profile;
}

export function parsePermitText(
  sourceText: string,
  sourceType: ParsedPermit["sourceType"],
  sourceUrl?: string
): ParsedPermit {
  const { originLabel, destinationLabel } = extractOriginDestination(sourceText);

  return {
    permitNumber: extractPermitNumber(sourceText),
    state: extractState(sourceText),
    originLabel,
    destinationLabel,
    truckProfile: extractTruckProfile(sourceText),
    steps: parseRouteSteps(sourceText),
    sourceText,
    sourceType,
    sourceUrl,
  };
}

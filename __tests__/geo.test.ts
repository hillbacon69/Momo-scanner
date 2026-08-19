import {
  bearingDegrees,
  haversineDistanceMeters,
  metersToFeet,
  metersToMiles,
  nearestPointOnPolyline,
  regionForCoordinates,
  remainingDistanceMeters,
} from "../src/utils/geo";
import { decodeFlexiblePolyline } from "../src/utils/flexiblePolyline";
import { encode } from "@here/flexpolyline";

describe("haversineDistanceMeters", () => {
  it("returns ~0 for the same point", () => {
    const p = { latitude: 32.0, longitude: -94.0 };
    expect(haversineDistanceMeters(p, p)).toBeCloseTo(0, 3);
  });

  it("matches a known distance (roughly 1 degree of longitude at the equator ~ 111km)", () => {
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 0, longitude: 1 };
    expect(haversineDistanceMeters(a, b)).toBeGreaterThan(110000);
    expect(haversineDistanceMeters(a, b)).toBeLessThan(112000);
  });
});

describe("bearingDegrees", () => {
  it("is ~90 for due east travel", () => {
    const a = { latitude: 30, longitude: -95 };
    const b = { latitude: 30, longitude: -94 };
    expect(bearingDegrees(a, b)).toBeGreaterThan(85);
    expect(bearingDegrees(a, b)).toBeLessThan(95);
  });

  it("is ~0 for due north travel", () => {
    const a = { latitude: 30, longitude: -95 };
    const b = { latitude: 31, longitude: -95 };
    expect(bearingDegrees(a, b)).toBeLessThan(1);
  });
});

describe("nearestPointOnPolyline", () => {
  const polyline = [
    { latitude: 32.0, longitude: -94.0 },
    { latitude: 32.0, longitude: -93.9 },
    { latitude: 32.1, longitude: -93.9 },
  ];

  it("finds ~0 distance for a point on the line", () => {
    const result = nearestPointOnPolyline({ latitude: 32.0, longitude: -93.95 }, polyline);
    expect(result).not.toBeNull();
    expect(result!.distanceMeters).toBeLessThan(5);
    expect(result!.segmentIndex).toBe(0);
  });

  it("finds a nonzero distance for a point off the line", () => {
    const result = nearestPointOnPolyline({ latitude: 32.05, longitude: -93.95 }, polyline);
    expect(result).not.toBeNull();
    expect(result!.distanceMeters).toBeGreaterThan(1000);
  });
});

describe("remainingDistanceMeters", () => {
  it("sums to ~0 at the very end of the polyline", () => {
    const polyline = [
      { latitude: 32.0, longitude: -94.0 },
      { latitude: 32.0, longitude: -93.9 },
    ];
    expect(remainingDistanceMeters(polyline, 0, 1)).toBeCloseTo(0, 0);
  });

  it("sums to the full segment length at the very start", () => {
    const polyline = [
      { latitude: 32.0, longitude: -94.0 },
      { latitude: 32.0, longitude: -93.9 },
    ];
    const full = haversineDistanceMeters(polyline[0], polyline[1]);
    expect(remainingDistanceMeters(polyline, 0, 0)).toBeCloseTo(full, -1);
  });
});

describe("regionForCoordinates", () => {
  it("returns null for an empty list", () => {
    expect(regionForCoordinates([])).toBeNull();
  });

  it("centers on the midpoint of the bounding box", () => {
    const region = regionForCoordinates([
      { latitude: 32.0, longitude: -94.0 },
      { latitude: 32.2, longitude: -93.8 },
    ]);
    expect(region).not.toBeNull();
    expect(region!.latitude).toBeCloseTo(32.1, 5);
    expect(region!.longitude).toBeCloseTo(-93.9, 5);
  });
});

describe("unit conversions", () => {
  it("converts meters to feet and miles correctly", () => {
    expect(metersToFeet(1)).toBeCloseTo(3.28084, 4);
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 5);
  });
});

describe("decodeFlexiblePolyline", () => {
  it("round-trips coordinates encoded by the official encoder", () => {
    const original = [
      [32.470237, -94.042496],
      [31.9686, -99.9018],
      [31.813376, -93.702942],
    ];
    const encoded = encode({ polyline: original, precision: 6 });
    const decoded = decodeFlexiblePolyline(encoded);

    expect(decoded).toHaveLength(3);
    decoded.forEach((point, i) => {
      expect(point.latitude).toBeCloseTo(original[i][0], 4);
      expect(point.longitude).toBeCloseTo(original[i][1], 4);
    });
  });
});

export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two points, in meters. */
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_METERS * c;
}

/** Initial bearing in degrees (0-360) from a to b. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLng = toRadians(b.longitude - a.longitude);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

export interface NearestPointResult {
  point: LatLng;
  segmentIndex: number;
  distanceMeters: number;
  /** 0 = at segment start, 1 = at segment end. */
  fractionAlongSegment: number;
}

/**
 * Finds the closest point on a polyline to `position`, using an
 * equirectangular projection local to the polyline. Accurate enough
 * for the short segment lengths found in road geometry (a few km),
 * and much cheaper than exact great-circle segment math.
 */
export function nearestPointOnPolyline(
  position: LatLng,
  polyline: LatLng[]
): NearestPointResult | null {
  if (polyline.length === 0) return null;
  if (polyline.length === 1) {
    return {
      point: polyline[0],
      segmentIndex: 0,
      distanceMeters: haversineDistanceMeters(position, polyline[0]),
      fractionAlongSegment: 0,
    };
  }

  const refLat = toRadians(position.latitude);
  const cosRefLat = Math.cos(refLat);

  const project = (p: LatLng) => ({
    x: toRadians(p.longitude) * cosRefLat * EARTH_RADIUS_METERS,
    y: toRadians(p.latitude) * EARTH_RADIUS_METERS,
  });

  const posP = project(position);

  let best: NearestPointResult | null = null;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = project(polyline[i]);
    const b = project(polyline[i + 1]);

    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;

    let t = lenSq === 0 ? 0 : ((posP.x - a.x) * abx + (posP.y - a.y) * aby) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = a.x + t * abx;
    const projY = a.y + t * aby;
    const dx = posP.x - projX;
    const dy = posP.y - projY;
    const distanceMeters = Math.sqrt(dx * dx + dy * dy);

    if (!best || distanceMeters < best.distanceMeters) {
      const lat =
        polyline[i].latitude + t * (polyline[i + 1].latitude - polyline[i].latitude);
      const lng =
        polyline[i].longitude + t * (polyline[i + 1].longitude - polyline[i].longitude);
      best = {
        point: { latitude: lat, longitude: lng },
        segmentIndex: i,
        distanceMeters,
        fractionAlongSegment: t,
      };
    }
  }

  return best;
}

/** Sum of remaining polyline distance from a given segment/fraction to the end, in meters. */
export function remainingDistanceMeters(
  polyline: LatLng[],
  fromSegmentIndex: number,
  fractionAlongSegment: number
): number {
  if (polyline.length < 2) return 0;
  let total = 0;
  const segStart = polyline[fromSegmentIndex];
  const segEnd = polyline[fromSegmentIndex + 1];
  if (segStart && segEnd) {
    total += haversineDistanceMeters(segStart, segEnd) * (1 - fractionAlongSegment);
  }
  for (let i = fromSegmentIndex + 1; i < polyline.length - 1; i++) {
    total += haversineDistanceMeters(polyline[i], polyline[i + 1]);
  }
  return total;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Bounding region that fits every point, with a padding margin so route ends aren't flush with the screen edge. */
export function regionForCoordinates(points: LatLng[], paddingFactor = 1.4): MapRegion | null {
  if (points.length === 0) return null;

  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;

  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }

  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;
  const latitudeDelta = Math.max((maxLat - minLat) * paddingFactor, 0.02);
  const longitudeDelta = Math.max((maxLng - minLng) * paddingFactor, 0.02);

  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

export function metersToFeet(meters: number): number {
  return meters * 3.28084;
}

export function metersToMiles(meters: number): number {
  return meters / 1609.344;
}

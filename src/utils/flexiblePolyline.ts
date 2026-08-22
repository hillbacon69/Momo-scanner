import { decode } from "@here/flexpolyline";
import type { LatLng } from "./geo";

/**
 * Decodes a HERE "flexible polyline" string (as returned by the HERE
 * Routing v8 API's `return=polyline`) into an ordered list of
 * {latitude, longitude} points. Wraps the official @here/flexpolyline
 * package rather than reimplementing the bit-packing spec by hand -
 * this geometry drives on-screen navigation, so it needs to be exactly
 * right rather than "close enough".
 */
export function decodeFlexiblePolyline(encoded: string): LatLng[] {
  const { polyline } = decode(encoded);
  return polyline.map(([latitude, longitude]) => ({ latitude, longitude }));
}

import type { RoutingProvider } from "./types";

const EARTH_RADIUS_M = 6_371_000;
export function haversineMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

const DETOUR_FACTOR = 1.3; // streets are longer than straight lines
const WALK_METERS_PER_MIN = 80; // ~4.8 km/h

/**
 * DEFAULT router: straight-line distance x detour factor. Labelled "estimate" everywhere it is shown.
 * Replace with a routed provider (OSRM/Mapbox/Google) by implementing RoutingProvider.
 */
export const estimateRouter: RoutingProvider = {
  name: "straight-line-estimate",
  async walkFromParkingToDestination(from, to) {
    const meters = Math.round(haversineMeters(from, to) * DETOUR_FACTOR);
    return { meters, minutes: Math.max(1, Math.ceil(meters / WALK_METERS_PER_MIN)), source: "estimate" };
  },
};

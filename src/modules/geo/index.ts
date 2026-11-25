/** Provider wiring. To use a real geocoder/router, implement the interfaces in ./types and swap them here. */
import { seededGeocoder } from "./geocoding";
import { estimateRouter } from "./routing";
import type { GeocodingProvider, RoutingProvider } from "./types";

export const geocoder: GeocodingProvider = seededGeocoder;
export const router: RoutingProvider = estimateRouter;
export type { Place, WalkEstimate } from "./types";

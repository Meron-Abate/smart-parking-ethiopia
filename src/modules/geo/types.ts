/**
 * Provider seams. Discovery depends on these interfaces only, so a real geocoder / router
 * (Google, Mapbox, OSM Nominatim/OSRM, a local Ethiopian provider) can be swapped in by
 * implementing the interface and changing `src/modules/geo/index.ts`.
 */
export interface Place {
  kind: "landmark" | "facility";
  id: string;
  name: string;
  subtitle: string;
  latitude: number;
  longitude: number;
}

export interface GeocodingProvider {
  readonly name: string;
  /** Free-text destination search. Never uses the user's device location. */
  search(query: string, limit?: number): Promise<Place[]>;
}

export interface WalkEstimate {
  /** Distance a person would walk, in metres. */
  meters: number;
  minutes: number;
  /** "estimate" = straight-line distance with a detour factor, NOT a routed path. */
  source: "estimate" | "routed";
}

export interface RoutingProvider {
  readonly name: string;
  walkFromParkingToDestination(
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
  ): Promise<WalkEstimate>;
}

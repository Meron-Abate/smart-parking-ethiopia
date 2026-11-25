import { db } from "@/platform/db";
import type { GeocodingProvider, Place } from "./types";

/** Escape LIKE wildcards so user input is matched literally. */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

interface Row {
  kind: "landmark" | "facility";
  id: string;
  name: string;
  subtitle: string | null;
  latitude: number;
  longitude: number;
}

/**
 * DEV/DEFAULT geocoder: searches only data WE hold (the seeded Landmark table plus approved
 * facility names). It does not call any external service. Coverage is therefore limited to the
 * curated list; replace with a real geocoder for production (implement GeocodingProvider).
 */
export const seededGeocoder: GeocodingProvider = {
  name: "seeded-landmarks",
  async search(query, limit = 8) {
    const q = query.trim().slice(0, 80);
    if (q.length < 2) return [];
    const like = `%${escapeLike(q)}%`;
    const rows = await db.$queryRaw<Row[]>`
      SELECT * FROM (
        SELECT 'landmark'::text AS kind, l.id, l.name,
               concat_ws(', ', initcap(l.category), l.neighborhood) AS subtitle,
               l.latitude, l.longitude,
               GREATEST(
                 similarity(l.name, ${q}),
                 CASE WHEN l.name ILIKE ${like} THEN 0.6 ELSE 0 END,
                 COALESCE((SELECT max(GREATEST(similarity(a, ${q}), CASE WHEN a ILIKE ${like} THEN 0.55 ELSE 0 END)) FROM unnest(l.alias) a), 0)
               ) AS score
        FROM "Landmark" l
        UNION ALL
        SELECT 'facility'::text, f.id, f.name,
               concat_ws(', ', 'Parking facility', f.neighborhood),
               f.latitude, f.longitude,
               GREATEST(similarity(f.name, ${q}), CASE WHEN f.name ILIKE ${like} THEN 0.5 ELSE 0 END)
        FROM "ParkingFacility" f
        WHERE f.status = 'APPROVED'
      ) r
      WHERE r.score >= 0.3
      ORDER BY r.score DESC, r.name
      LIMIT ${limit}`;
    return rows.map<Place>((r) => ({ kind: r.kind, id: r.id, name: r.name, subtitle: r.subtitle ?? "", latitude: r.latitude, longitude: r.longitude }));
  },
};

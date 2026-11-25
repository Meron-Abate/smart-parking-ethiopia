/**
 * Curated Addis Ababa destinations (reference data for destination search).
 *
 * ACCURACY: coordinates are APPROXIMATE (roughly +/- 300 m), entered from general knowledge, not surveyed.
 * They are good enough to exercise radius discovery. Before launch, verify against OpenStreetMap / a
 * surveyed source, or replace the geocoder with a real provider (see src/modules/geo/geocoding.ts).
 * Re-running the loader is safe: rows are matched by name and updated in place.
 */
export interface LandmarkSeed {
  name: string;
  alias?: string[];
  category: string;
  neighborhood: string;
  lat: number;
  lng: number;
}

export const LANDMARKS: LandmarkSeed[] = [
  { name: "Meskel Square", alias: ["Meskel Sq", "Mesqel Square"], category: "square", neighborhood: "Meskel Square", lat: 9.0107, lng: 38.7612 },
  { name: "Bole International Airport", alias: ["Addis Ababa Bole Airport", "Airport", "ADD"], category: "transport", neighborhood: "Bole", lat: 8.9779, lng: 38.7993 },
  { name: "Piassa", alias: ["Piazza", "Arada"], category: "district", neighborhood: "Piassa", lat: 9.0350, lng: 38.7500 },
  { name: "Mercato", alias: ["Merkato", "Addis Ketema Market"], category: "market", neighborhood: "Addis Ketema", lat: 9.0300, lng: 38.7360 },
  { name: "Churchill Avenue", alias: ["Churchill Road"], category: "street", neighborhood: "Arada", lat: 9.0305, lng: 38.7480 },
  { name: "National Museum of Ethiopia", alias: ["Lucy Museum"], category: "museum", neighborhood: "Arat Kilo", lat: 9.0396, lng: 38.7611 },
  { name: "Addis Ababa University (Sidist Kilo)", alias: ["AAU", "Sidist Kilo Campus", "6 Kilo"], category: "university", neighborhood: "Sidist Kilo", lat: 9.0407, lng: 38.7635 },
  { name: "Tikur Anbessa Hospital", alias: ["Black Lion Hospital"], category: "hospital", neighborhood: "Lamberet", lat: 9.0306, lng: 38.7624 },
  { name: "Unity Park", alias: ["National Palace Park"], category: "park", neighborhood: "Arat Kilo", lat: 9.0155, lng: 38.7635 },
  { name: "African Union Headquarters", alias: ["AU", "AU HQ"], category: "office", neighborhood: "Kirkos", lat: 9.0193, lng: 38.7464 },
  { name: "Edna Mall", alias: ["Edna Mall Bole"], category: "mall", neighborhood: "Bole", lat: 8.9956, lng: 38.7870 },
  { name: "Friendship City Center", alias: ["Friendship Mall", "Friendship Building"], category: "mall", neighborhood: "Bole", lat: 8.9965, lng: 38.7838 },
  { name: "Hilton Addis Ababa", alias: ["Hilton Hotel"], category: "hotel", neighborhood: "Arat Kilo", lat: 9.0200, lng: 38.7640 },
  { name: "Sheraton Addis", alias: ["Sheraton Hotel"], category: "hotel", neighborhood: "Arat Kilo", lat: 9.0208, lng: 38.7618 },
  { name: "Hyatt Regency Addis Ababa", alias: ["Hyatt"], category: "hotel", neighborhood: "Meskel Square", lat: 9.0118, lng: 38.7598 },
  { name: "Skylight Hotel", alias: ["Ethiopian Skylight Hotel"], category: "hotel", neighborhood: "Bole", lat: 8.9847, lng: 38.7936 },
  { name: "Millennium Hall", alias: ["Millenium Hall"], category: "venue", neighborhood: "Bole", lat: 8.9942, lng: 38.7691 },
  { name: "Ethiopian Airlines Headquarters", alias: ["Ethiopian Airlines HQ"], category: "office", neighborhood: "Bole", lat: 8.9783, lng: 38.7960 },
  { name: "Arat Kilo", alias: ["4 Kilo", "Arat Kilo Square"], category: "district", neighborhood: "Arat Kilo", lat: 9.0346, lng: 38.7640 },
  { name: "Sidist Kilo", alias: ["6 Kilo"], category: "district", neighborhood: "Sidist Kilo", lat: 9.0407, lng: 38.7635 },
  { name: "Megenagna", alias: ["Megenagna Square"], category: "district", neighborhood: "Megenagna", lat: 9.0197, lng: 38.8004 },
  { name: "Kazanchis", alias: ["Kazanchis Business District"], category: "district", neighborhood: "Kazanchis", lat: 9.0163, lng: 38.7716 },
  { name: "Lideta", alias: ["Lideta Square"], category: "district", neighborhood: "Lideta", lat: 9.0107, lng: 38.7366 },
  { name: "Mexico Square", alias: ["Mexico"], category: "square", neighborhood: "Kirkos", lat: 9.0111, lng: 38.7437 },
  { name: "St. George Cathedral", alias: ["Giorgis", "Kidist Giorgis"], category: "landmark", neighborhood: "Piassa", lat: 9.0360, lng: 38.7507 },
  { name: "Holy Trinity Cathedral", alias: ["Kidist Selassie"], category: "landmark", neighborhood: "Arat Kilo", lat: 9.0312, lng: 38.7645 },
  { name: "National Theatre", alias: ["Ethiopian National Theatre"], category: "venue", neighborhood: "Arada", lat: 9.0316, lng: 38.7488 },
  { name: "Bole Medhanialem", alias: ["Medhanialem Church"], category: "district", neighborhood: "Bole", lat: 8.9969, lng: 38.7836 },
  { name: "Bole Atlas", alias: ["Atlas", "Atlas Area"], category: "district", neighborhood: "Bole", lat: 8.9958, lng: 38.7864 },
  { name: "Commercial Bank of Ethiopia Head Office", alias: ["CBE HQ", "CBE Head Office"], category: "office", neighborhood: "Arada", lat: 9.0330, lng: 38.7440 },
  { name: "Addis Ababa Stadium", alias: ["Abebe Bikila Stadium", "Addis Ababa National Stadium"], category: "venue", neighborhood: "Meskel Square", lat: 9.0120, lng: 38.7585 },
  { name: "Autobus Tera", alias: ["Mercato Bus Terminal"], category: "transport", neighborhood: "Addis Ketema", lat: 9.0300, lng: 38.7330 },
  { name: "Ras Hotel", alias: ["Ras Hotel Addis"], category: "hotel", neighborhood: "Arat Kilo", lat: 9.0345, lng: 38.7603 },
  { name: "Ethiopian Parliament", alias: ["House of Peoples' Representatives"], category: "government", neighborhood: "Arat Kilo", lat: 9.0278, lng: 38.7527 },
  { name: "Lebu", alias: ["Lebu Square"], category: "district", neighborhood: "Nifas Silk-Lafto", lat: 8.9567, lng: 38.7274 },
  { name: "Sarbet", alias: ["Sar Bet"], category: "district", neighborhood: "Nifas Silk-Lafto", lat: 8.9958, lng: 38.7362 },
  { name: "Gerji", alias: ["Gerji Mebrat Hail"], category: "district", neighborhood: "Bole", lat: 9.0054, lng: 38.8223 },
  { name: "CMC", alias: ["CMC Michael", "CMC Square"], category: "district", neighborhood: "Bole", lat: 9.0234, lng: 38.8406 },
  { name: "Gotera", alias: ["Gotera Interchange"], category: "district", neighborhood: "Kirkos", lat: 8.9930, lng: 38.7585 },
  { name: "Saris", alias: ["Saris Abo"], category: "district", neighborhood: "Kirkos", lat: 8.9690, lng: 38.7596 },
  { name: "Entoto Park", alias: ["Entoto Natural Park"], category: "park", neighborhood: "Entoto", lat: 9.0830, lng: 38.7690 },
];

/** Idempotent upsert by name. Used by the dev seed and the standalone loader. */
export async function loadLandmarks(db: import("@prisma/client").PrismaClient): Promise<number> {
  for (const l of LANDMARKS) {
    const data = {
      name: l.name,
      alias: l.alias ?? [],
      category: l.category,
      neighborhood: l.neighborhood,
      address: `${l.neighborhood}, Addis Ababa`,
      latitude: l.lat,
      longitude: l.lng,
    };
    const existing = await db.landmark.findFirst({ where: { name: l.name }, select: { id: true } });
    if (existing) await db.landmark.update({ where: { id: existing.id }, data });
    else await db.landmark.create({ data });
  }
  return LANDMARKS.length;
}

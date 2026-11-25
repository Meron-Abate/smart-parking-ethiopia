import { route, ok } from "@/platform/http";
import { discoverQuery } from "@/modules/discovery/schemas";
import { discover } from "@/modules/discovery/service";

// Public: parking around a DESTINATION (lat/lng are the destination's, not the driver's position).
export const GET = route({ query: discoverQuery, rateLimit: { name: "discover", limit: 60, windowMs: 60_000 } }, async ({ query }) => {
  const { facilities, meta } = await discover(query);
  return ok(facilities, { meta });
});

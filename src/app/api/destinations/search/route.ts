import { route, ok } from "@/platform/http";
import { geocoder } from "@/modules/geo";
import { destinationSearchQuery } from "@/modules/discovery/schemas";

// Public: destination autocomplete. Uses the typed text only, never the caller's location.
export const GET = route({ query: destinationSearchQuery, rateLimit: { name: "dest-search", limit: 90, windowMs: 60_000 } }, async ({ query }) =>
  ok(await geocoder.search(query.q), { meta: { provider: geocoder.name } }),
);

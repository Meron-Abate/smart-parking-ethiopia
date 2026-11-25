# Smart Parking Ethiopia

Destination-based parking discovery, reservation and management for Addis Ababa.
**Central promise:** pick where you are going → see available parking around *that destination* → reserve → arrive with a space secured.

Architecture, ER diagram, lifecycle and payment diagrams, assumptions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Status

| Phase | State |
|-------|-------|
| 1 Foundation (scaffold, schema, auth, RBAC, layouts, Docker) | **done** (see limitations below) |
| 2 Facility management (operator sign-up, facilities, inventory, pricing, hours, policies, admin review) | **done** |
| 3 Destination discovery (autocomplete, radius search, availability, map) | **done** (see Phase 3 notes) |
| 4 Reservations (holds, no-double-booking, cancel, extend, expiry/no-show sweep, vehicles) | **done** (payment is simulated in dev only; see Phase 4 notes) |
| 5–9 | not started |

Driver pages for active parking, payments and notifications are placeholders until their phase. Unbuilt sidebar items are deliberately not links.

## Quick start

```bash
cp .env.example .env            # then set AUTH_SECRET (>= 32 chars)
npm install
npm run db:up                   # PostgreSQL 16 + PostGIS on localhost:5433
npm run db:deploy               # apply migrations
npm run db:seed                 # dev-only fake data (+ landmark reference data)
npm run job:sweep               # release expired holds / mark no-shows (schedule every minute in production)
npm run db:seed:demo            # dev-only: 16 demo facilities around Addis landmarks (see Phase 3 notes)
npm run dev                     # http://localhost:3000
npm test                        # unit + integration (integration needs the DB)
```

Seed accounts (password `Passw0rd!dev`): `admin@parking.test` (super admin),
`owner@bole-atlas-parking.test` (facility admin), `attendant@bole-atlas-parking.test`, `driver@parking.test`.
Seed facilities use approximate coordinates and are marked "(demo)".

## Conventions

* Money: integer santim. Time: UTC in the DB, `Africa/Addis_Ababa` for display (`src/platform/time.ts`).
* Public registration can only create DRIVER accounts. Role is re-read from the DB on every request.
* Every route handler goes through `route()` in `src/platform/http.ts` (origin check, rate limit, auth, validation, error mapping).
* Facility-scoped operations must call `assertFacilityAccess` (`src/modules/rbac/scope.ts`).
* DB-only guarantees (PostGIS trigger/index, no-double-booking exclusion constraint, CHECKs) live in the raw SQL migration `prisma/migrations/*_postgis_and_constraints`.

## Phase 2 notes

* Operators sign up at `/register-facility` (creates a FACILITY_ADMIN + active organization). Every facility starts `PENDING_APPROVAL`;
  a super admin reviews it at `/admin/facilities`. Approval is refused until the facility has capacity, opening hours (or is 24h) and an active pricing rule.
* Facility status changes only through the action table in `src/modules/facilities/transitions.ts` (approve / reject / suspend / resubmit).
  Editing a rejected facility resubmits it. Operators cannot change status or inventory model.
* Individual-space facilities: capacity always equals the number of spaces. Capacity-based facilities: capacity is edited directly.
* Facility location is entered as coordinates (validated to lie within Ethiopia). Map picking arrives with Phase 3.
* Not yet in Phase 2: facility image upload (needs a storage decision), staff/attendant management (Phase 7), CSV import of spaces.
* Payments use the **mock** provider only; no real provider is integrated.

## Known Phase 1 limitations

* Password reset, email/phone verification: not implemented (need Phase 8 notification delivery).
* Rate limiter is in-memory/per-process; Redis-backed in Phase 4.
* shadcn/ui components are hand-written in shadcn's style (`src/components/ui`); the shadcn CLI was not run.
* The `Roles`/`Permissions` tables from the spec are replaced by a role enum + membership tables (see ARCHITECTURE §0.1 C3).
* Dockerfile is a dev image only; production image is Phase 9.
* OpenAPI docs: Phase 7.

## Phase 3 notes: destination discovery

* Driver flow: home page (or `/search`) → type a destination → pick it → parking within 500 m / 1 / 2 / 5 km **of the destination**, for the chosen arrival time, stay length and vehicle. The driver's GPS is never used (`discoverQuery` has no such input; a test enforces it).
* API (public, rate-limited): `GET /api/destinations/search?q=` and `GET /api/parking/discover?lat&lng&radius&arrivalAt&durationMinutes&vehicleType&covered&indoor&open24&features&maxPriceCents&showUnavailable&sort`.
* Availability counts, for the whole requested window, spaces not held by a reservation (`blocksInventory`) or maintenance. Capacity-based facilities subtract every overlapping booking (conservative; Phase 4 enforces the exact rule under a lock). Facilities are also marked CLOSED (outside opening hours, Addis time), NOT_BOOKABLE (stay length / advance-booking policy) or NO_PRICE.
* Prices are **server-side estimates** (`src/modules/pricing/calculate.ts`, integer santim). Weekday/time-band price rules are not evaluated yet.
* **Replaceable seams** (`src/modules/geo`): `GeocodingProvider` (default: seeded landmark table + approved facility names via pg_trgm; no external calls) and `RoutingProvider` (default: straight-line distance x 1.3, labelled an estimate). Swap by implementing the interface in `src/modules/geo/types.ts` and changing `src/modules/geo/index.ts`.
* Landmarks (`prisma/landmarks.ts`, 41 places) have **approximate** coordinates (~300 m) and must be verified before launch. `npm run db:seed:landmarks` loads them in any environment.
* Map: Leaflet + OpenStreetMap tiles (fine for development; production needs a tile provider agreement). The facility form now has a click-to-set-location map.
* The "Reserve" button on results is deliberately disabled until Phase 4.

### Trying it with your own data

1. **Bulk demo data:** `npm run db:seed:demo` (after `npm run db:seed`). Remove it again with `npm run db:seed:demo -- --remove`. Then search for Meskel Square, Bole Airport, Edna Mall, Piassa, Kazanchis… The set includes nearly-full, full, closed-by-hours, covered, EV-charging and 24h examples.
2. **Through the UI:** sign in as `owner@bole-atlas-parking.test` → Add facility (pick the spot on the map) → add spaces, pricing and hours → sign in as `admin@parking.test` → approve at `/admin/facilities` → search for a nearby landmark as any visitor.

## Phase 4 notes: reservations

* Driver flow: search → **Reserve** → pick vehicle → `POST /api/reservations` creates a **hold** (`PENDING_PAYMENT`, inventory blocked, `hold.minutes` platform setting, default 10) → pay the deposit → `CONFIRMED`. Also: cancel (refund per the policy snapshot), extend, vehicles CRUD (`/vehicles`), `/bookings`, `/bookings/:id`.
* API (all DRIVER-only, CSRF + rate-limited): `GET/POST /api/vehicles`, `DELETE /api/vehicles/:id`, `GET /api/reservations/quote`, `GET/POST /api/reservations`, `GET /api/reservations/:id`, `POST /api/reservations/:id/{cancel,extend}`.
* **No double booking.** Numbered spaces: the database exclusion constraint `Reservation_no_space_overlap` is the guard (loser of a race moves to the next free space or gets a clean 409). Capacity-based: a per-facility Postgres advisory lock serialises the check, which uses **peak concurrent load** over the requested window (`src/modules/reservations/availability.ts`). Tests fire 8–10 simultaneous requests and assert the exact number of winners; removing the lock makes the capacity test fail (verified).
* **Price and deposit are computed on the server** from the facility's pricing rule and are snapshotted (with the cancellation and reservation policy) on the reservation; input cannot carry price, status or owner fields. Extensions are priced from the snapshot.
* **Lifecycle** lives in `src/modules/reservations/transitions.ts` (confirm / expire / cancel / noShow). A reservation can be extended while confirmed/active: the extra time is held immediately and reverted by the sweeper if the extension is not paid in time.
* **Expiry and no-shows** are done by `sweep()` (`npm run job:sweep`): unpaid holds -> EXPIRED, unpaid extensions reverted, confirmed bookings not arrived within the grace period -> NO_SHOW. It also runs lazily before reservation reads/writes, and availability ignores expired holds even before the sweep. **There is no Redis/BullMQ worker yet** (no Redis in this stack): in production schedule `npm run job:sweep` every minute (or add a queue in Phase 9). Deposit forfeiture on no-show is recorded as policy only; money moves in Phase 5.
* **Payment is not implemented.** The "Pay deposit" button is disabled and says so. In `next dev` (NODE_ENV != production) a clearly labelled **Simulate payment** button/endpoint flips the status to CONFIRMED so the rest of the flow can be tried; it moves no money and returns 404 in production builds. Phase 5 replaces it with the payment abstraction + mock provider.
* Cancellation returns `refundDueCents` and audits it; nothing is refunded until Phase 5.
* Limits: 3 unpaid holds per driver; a vehicle cannot hold two overlapping reservations; 10 vehicles per driver.
* Not in Phase 4: choosing a specific numbered space in the UI (the API accepts `spaceId`; the UI auto-assigns), attendant check-in/QR (Phase 6), notifications (Phase 8).

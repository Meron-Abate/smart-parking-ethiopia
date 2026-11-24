# Smart Parking Ethiopia

Destination-based parking discovery, reservation and management for Addis Ababa.
**Central promise:** pick where you are going → see available parking around *that destination* → reserve → arrive with a space secured.

Architecture, ER diagram, lifecycle and payment diagrams, assumptions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Status

| Phase | State |
|-------|-------|
| 1 Foundation (scaffold, schema, auth, RBAC, layouts, Docker) | **done** (see limitations below) |
| 2 Facility management (operator sign-up, facilities, inventory, pricing, hours, policies, admin review) | **done** |
| 3 Destination discovery | not started |
| 4–9 | not started |

The driver homepage's destination field is intentionally **inactive** until Phase 3. All role dashboards are placeholders that say so.

## Quick start

```bash
cp .env.example .env            # then set AUTH_SECRET (>= 32 chars)
npm install
npm run db:up                   # PostgreSQL 16 + PostGIS on localhost:5433
npm run db:deploy               # apply migrations
npm run db:seed                 # dev-only fake data
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

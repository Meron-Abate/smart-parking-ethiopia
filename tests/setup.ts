import { config } from "dotenv";

// Load .env for local runs; CI passes real env vars. Test defaults only fill gaps.
config({ quiet: true });
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123456";
process.env.APP_ORIGIN ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgresql://parking:parking_dev_password@localhost:5433/parking?schema=public";

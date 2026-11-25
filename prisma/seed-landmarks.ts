/** Standalone loader for the landmark reference data. Safe to run in any environment (not fake business data). */
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { loadLandmarks } from "./landmarks";

config({ quiet: true });
const db = new PrismaClient();
loadLandmarks(db)
  .then((n) => console.log(`Loaded ${n} landmarks.`))
  .finally(() => db.$disconnect());

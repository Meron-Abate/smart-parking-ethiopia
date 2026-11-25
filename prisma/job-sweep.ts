/** Releases expired holds/extensions and marks no-shows. Run every minute from the OS scheduler, or let the lazy sweeps cover it in dev. */
import { config } from "dotenv";
config({ quiet: true });

async function main() {
  const { sweep } = await import("../src/modules/reservations/service");
  const { db } = await import("../src/platform/db");
  console.log(JSON.stringify(await sweep()));
  await db.$disconnect();
}
main();

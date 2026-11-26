import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Serves data/snapshot.json (see scripts/snapshot.mts). It is read once at build time and
 * shipped as a static file, so a deployment shows exactly the snapshot it was built from.
 * After re-scraping, rebuild (locally) or commit the new snapshot and redeploy (Vercel).
 */
export const dynamic = "force-static";

export async function GET() {
  try {
    const raw = await readFile(path.join(process.cwd(), "data", "snapshot.json"), "utf8");
    return new Response(raw, { headers: { "content-type": "application/json; charset=utf-8" } });
  } catch {
    return Response.json(
      { error: "No data snapshot found. Run `npm run scrape` (or `npm run snapshot`) and commit data/snapshot.json." },
      { status: 404 }
    );
  }
}

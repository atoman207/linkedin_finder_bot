import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Fallback for the static public file at /data/snapshot.json.
 * Both copies are written by `npm run snapshot` and committed so Vercel deploys all users
 * with no database — the build ships the JSON as-is.
 */
export const dynamic = "force-static";

async function readSnapshot() {
  const roots = [
    path.join(process.cwd(), "public", "data", "snapshot.json"),
    path.join(process.cwd(), "data", "snapshot.json"),
  ];
  for (const file of roots) {
    try {
      return await readFile(file, "utf8");
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function GET() {
  const raw = await readSnapshot();
  if (!raw) {
    return Response.json(
      { error: "No data snapshot found. Run `npm run scrape` (or `npm run snapshot`) and commit data/snapshot.json." },
      { status: 404 }
    );
  }
  return new Response(raw, { headers: { "content-type": "application/json; charset=utf-8" } });
}

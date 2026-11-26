import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const raw = await readFile(path.join(process.cwd(), "data", "engineers.json"), "utf8");
    return new Response(raw, {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: "No data yet. Run `npm run scrape` to collect profiles." }, { status: 404 });
  }
}

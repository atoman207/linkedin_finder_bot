/**
 * Builds data/snapshot.json from data/engineers.json.
 *
 * The snapshot is the ONLY data file that is committed and deployed (Vercel). It applies the
 * rules in lib/config.ts (LinkedIn-only, hidden countries) — so removed people are not shipped
 * at all — and keeps only the fields the app and the CSV export use.
 *
 *   npm run snapshot     (also runs automatically at the end of `npm run scrape`)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HIDDEN_COUNTRIES, HIDE_DEAD_LINKEDIN, REQUIRE_LINKEDIN } from "../lib/config.ts";
import { isDeadLinkedin } from "../lib/linkedin.ts";
import { countryOf } from "../lib/regions.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "data", "engineers.json");
const OUT = path.join(ROOT, "data", "snapshot.json");
/** Static copy shipped with the site (Vercel serves /data/snapshot.json with no DB). */
const PUBLIC_OUT = path.join(ROOT, "public", "data", "snapshot.json");

/** Fields read by components/* and lib/csv.ts — everything else (bio, instagram, …) is dropped. */
const FIELDS = [
  "id", "profileUrl", "rank", "avatar", "verified", "cardFlagCode", "username", "name", "linkedinName",
  "headline", "category", "experience", "yearlySalary", "hourlyRate", "residencyCode", "residencyName",
  "nationalityCode", "nationalityName", "linkedin", "telegram", "telegramId", "telegramInvalid", "github",
  "website", "twitter", "skills", "languages", "latestJob", "fetchError", "linkedinStatus", "linkedinStatusReason",
];

if (!fs.existsSync(SRC)) {
  console.error(`Missing ${path.relative(ROOT, SRC)} — run \`npm run scrape\` first.`);
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(SRC, "utf8"));

let hiddenCountry = 0;
let noLinkedin = 0;
let deadLinkedin = 0;
const engineers: Record<string, unknown>[] = [];
for (const e of raw.engineers) {
  if (HIDDEN_COUNTRIES.has(countryOf(e).key)) {
    hiddenCountry++;
    continue;
  }
  if (REQUIRE_LINKEDIN && !e.linkedin) {
    noLinkedin++;
    continue;
  }
  if (HIDE_DEAD_LINKEDIN && isDeadLinkedin(e)) {
    deadLinkedin++;
    continue;
  }
  const o: Record<string, unknown> = {};
  for (const f of FIELDS) {
    const v = e[f];
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) continue;
    o[f] = v;
  }
  engineers.push(o);
}

const snapshot = {
  source: raw.source,
  scrapedAt: raw.scrapedAt,
  total: engineers.length,
  failed: engineers.filter((e) => e.fetchError).length,
  removed: { linkedin: noLinkedin, country: hiddenCountry, deadLinkedin },
  engineers,
};
const body = JSON.stringify(snapshot);
fs.writeFileSync(OUT, body);
fs.mkdirSync(path.dirname(PUBLIC_OUT), { recursive: true });
fs.writeFileSync(PUBLIC_OUT, body);
const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log(
  `Wrote ${path.relative(ROOT, OUT)} + ${path.relative(ROOT, PUBLIC_OUT)}: ` +
    `${engineers.length} engineers (${kb} KB); ` +
    `left out ${noLinkedin} without LinkedIn, ${deadLinkedin} dead/404 LinkedIn, ` +
    `${hiddenCountry} in hidden countries.`
);

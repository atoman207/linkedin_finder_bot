#!/usr/bin/env node
/**
 * Checks LinkedIn URLs in data/engineers.json for 404 / Profile Not Found / suspended pages.
 * Writes data/cache/linkedin-status.json and stamps engineers with linkedinStatus.
 *
 *   node scripts/check-linkedin.mjs
 *   node scripts/check-linkedin.mjs --fresh          # ignore prior status cache
 *   node scripts/check-linkedin.mjs --concurrency 3 --delay 400
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const ENGINEERS = path.join(DATA_DIR, "engineers.json");
const STATUS_CACHE = path.join(DATA_DIR, "cache", "linkedin-status.json");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : def;
};
const FRESH = flag("fresh");
const CONCURRENCY = Math.max(1, opt("concurrency", 2));
const DELAY_MS = Math.max(0, opt("delay", 600));

/** Facebook's crawler UA gets real 404 / Profile Not Found instead of LinkedIn's 999 bot wall. */
const HEADERS = {
  "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Keep in sync with lib/linkedin.ts BAD_LINKEDIN_SLUGS. */
const BAD_SLUGS = new Set([
  "linkedin",
  "company",
  "companies",
  "profile",
  "in",
  "pub",
  "school",
  "showcase",
  "jobs",
  "feed",
  "login",
  "signup",
  "home",
]);

function slugOf(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0]?.toLowerCase() !== "in" || !parts[1]) return null;
    return decodeURIComponent(parts[1]).toLowerCase().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function classifyHeuristic(url) {
  if (!url) return { status: "dead", reason: "missing" };
  const slug = slugOf(url);
  if (!slug) return { status: "dead", reason: "not-profile-url" };
  if (BAD_SLUGS.has(slug)) return { status: "dead", reason: `bad-slug:${slug}` };
  if (slug.length < 2) return { status: "dead", reason: "slug-too-short" };
  return null;
}

function classifyResponse(res, html, finalUrl) {
  if (res.status === 404 || res.status === 410) {
    return { status: "dead", reason: `http-${res.status}` };
  }
  const title = (html.match(/<title[^>]*>([^<]*)/i) || [])[1]?.trim() || "";
  const lowTitle = title.toLowerCase();
  const lowHtml = html.slice(0, 80_000).toLowerCase();
  const lowFinal = (finalUrl || "").toLowerCase();

  if (lowTitle.includes("profile not found") || lowTitle.includes("page not found")) {
    return { status: "dead", reason: "title-not-found" };
  }
  if (
    lowHtml.includes("this profile is not available") ||
    lowHtml.includes("profile is not available") ||
    lowHtml.includes("this page doesn’t exist") ||
    lowHtml.includes("this page doesn't exist") ||
    lowHtml.includes("the member you are trying to view") ||
    /account.*(suspend|restrict)/i.test(html.slice(0, 80_000))
  ) {
    return { status: "dead", reason: "unavailable-or-suspended" };
  }
  if (lowFinal.includes("/404") || lowFinal.includes("profile-not-found")) {
    return { status: "dead", reason: "redirect-404" };
  }
  // LinkedIn bot wall — unknown; do not hide solely for this.
  if (res.status === 999 || lowHtml.includes("authwall") || lowTitle.includes("security verification")) {
    return { status: "unknown", reason: `blocked-${res.status}` };
  }
  if (res.status >= 200 && res.status < 400) {
    return { status: "ok", reason: `http-${res.status}` };
  }
  return { status: "unknown", reason: `http-${res.status}` };
}

async function checkUrl(url) {
  const heuristic = classifyHeuristic(url);
  if (heuristic) return { ...heuristic, checkedAt: new Date().toISOString() };

  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
      });
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after"));
        const wait = (Number.isFinite(ra) && ra > 0 ? ra * 1000 : 8_000 * attempt) + Math.random() * 1000;
        await sleep(wait);
        continue;
      }
      const html = await res.text();
      return { ...classifyResponse(res, html, res.url), checkedAt: new Date().toISOString(), httpStatus: res.status };
    } catch (e) {
      if (attempt >= 6) {
        return { status: "unknown", reason: `error:${e.message}`, checkedAt: new Date().toISOString() };
      }
      await sleep(3_000 * attempt);
    }
  }
  return { status: "unknown", reason: "rate-limited", checkedAt: new Date().toISOString() };
}

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const raw = await loadJson(ENGINEERS, null);
  if (!raw?.engineers?.length) {
    console.error("Missing data/engineers.json — run npm run scrape first.");
    process.exit(1);
  }

  const prev = FRESH ? {} : (await loadJson(STATUS_CACHE, {})).byUrl || {};
  const byUrl = { ...prev };
  const unique = [...new Set(raw.engineers.map((e) => e.linkedin).filter(Boolean))];

  // Always re-apply heuristics (overrides cache for placeholders)
  for (const u of unique) {
    const h = classifyHeuristic(u);
    if (h) byUrl[u] = { ...h, checkedAt: new Date().toISOString() };
  }

  // Re-check unknowns (e.g. prior Chrome UA got LinkedIn 999 walls) unless value is already dead/ok.
  const needNet = unique.filter((u) => {
    if (classifyHeuristic(u)) return false;
    if (FRESH) return true;
    const s = byUrl[u]?.status;
    return !s || s === "unknown";
  });
  console.log(`LinkedIn URLs: ${unique.length} unique; checking ${needNet.length} (cache hits ${unique.length - needNet.length})`);

  let i = 0;
  let dead = 0;
  let ok = 0;
  let unknown = 0;
  const queue = async () => {
    while (i < needNet.length) {
      const idx = i++;
      const url = needNet[idx];
      if (DELAY_MS) await sleep(DELAY_MS);
      const result = await checkUrl(url);
      byUrl[url] = result;
      if (result.status === "dead") dead++;
      else if (result.status === "ok") ok++;
      else unknown++;
      if ((idx + 1) % 25 === 0 || idx + 1 === needNet.length) {
        console.log(`  ${idx + 1}/${needNet.length} (dead+${dead} ok+${ok} unknown+${unknown} this run)`);
        await fs.mkdir(path.dirname(STATUS_CACHE), { recursive: true });
        await fs.writeFile(STATUS_CACHE, JSON.stringify({ updatedAt: new Date().toISOString(), byUrl }));
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => queue()));

  // Stamp engineers.json
  let stampedDead = 0;
  for (const e of raw.engineers) {
    const s = e.linkedin ? byUrl[e.linkedin] : { status: "dead", reason: "missing" };
    if (s) {
      e.linkedinStatus = s.status;
      e.linkedinStatusReason = s.reason;
      if (s.status === "dead") stampedDead++;
    }
  }
  raw.linkedinCheckAt = new Date().toISOString();
  await fs.writeFile(ENGINEERS, JSON.stringify(raw, null, 1));
  await fs.mkdir(path.dirname(STATUS_CACHE), { recursive: true });
  await fs.writeFile(
    STATUS_CACHE,
    JSON.stringify({ updatedAt: new Date().toISOString(), byUrl }, null, 0)
  );

  const counts = { dead: 0, ok: 0, unknown: 0, missing: 0 };
  for (const u of unique) {
    const s = byUrl[u]?.status || "unknown";
    counts[s] = (counts[s] || 0) + 1;
  }
  console.log(`Done. Unique: ${JSON.stringify(counts)}; engineers marked dead: ${stampedDead}`);
  console.log(`Wrote ${path.relative(ROOT, STATUS_CACHE)} and updated ${path.relative(ROOT, ENGINEERS)}`);
}

await main();

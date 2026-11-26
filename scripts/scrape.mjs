#!/usr/bin/env node
/**
 * Scrapes blockchain engineer profiles from https://web3.career/hire/blockchain
 *
 *   npm run scrape                 # crawl listing, fetch profiles not yet cached
 *   npm run scrape -- --fresh      # ignore the cache and refetch everything
 *   npm run scrape -- --max-pages 5 --concurrency 3 --delay 400
 *
 * Output: data/engineers.json (read by the Next.js app)
 * Cache:  data/cache/profiles.json (lets an interrupted run resume)
 */
import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://web3.career";
const LIST_PATH = "/hire/blockchain";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const CACHE_DIR = path.join(DATA_DIR, "cache");
const PROFILE_CACHE = path.join(CACHE_DIR, "profiles.json");
const OUT_FILE = path.join(DATA_DIR, "engineers.json");

// ---------------------------------------------------------------- CLI args
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : def;
};
const FRESH = flag("fresh");
const RELIST = FRESH || flag("relist");
const MAX_PAGES = opt("max-pages", 2000);
const CONCURRENCY = Math.max(1, opt("concurrency", 2));
const DELAY_MS = Math.max(0, opt("delay", 800));
const LISTING_CACHE = path.join(CACHE_DIR, "listing.json");
const LISTING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => ms + Math.floor(Math.random() * ms * 0.5);

// ---------------------------------------------------------------- HTTP + shared throttle
/**
 * One throttle shared by all workers: a 429 pauses *every* worker, grows the
 * cooldown on repeated hits and slows the request pace; sustained success
 * slowly relaxes the pace back toward --delay.
 */
const throttle = {
  pauseUntil: 0,
  delay: DELAY_MS,
  strikes: 0,
  streak: 0,
  async wait() {
    while (Date.now() < this.pauseUntil) await sleep(this.pauseUntil - Date.now());
  },
  penalize(retryAfterMs) {
    this.strikes++;
    this.streak = 0;
    const cooldown = retryAfterMs || Math.min(120_000, 15_000 * 2 ** Math.min(this.strikes - 1, 3));
    this.delay = Math.min(10_000, Math.round(this.delay * 1.5));
    if (Date.now() + cooldown > this.pauseUntil) {
      this.pauseUntil = Date.now() + cooldown;
      console.warn(`  ! rate limited (429) — pausing all workers ${Math.round(cooldown / 1000)}s, delay now ${this.delay}ms`);
    }
  },
  reward() {
    if (++this.streak >= 40) {
      this.streak = 0;
      this.strikes = Math.max(0, this.strikes - 1);
      this.delay = Math.max(DELAY_MS, Math.round(this.delay * 0.9));
    }
  },
};

async function fetchHtml(url) {
  const MAX_ATTEMPTS = 10;
  for (let attempt = 1; ; attempt++) {
    await throttle.wait();
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(30_000) });
      if (res.status === 404 || res.status === 410) return { status: res.status, html: null };
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after"));
        throttle.penalize(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 0);
        if (attempt >= MAX_ATTEMPTS) throw new Error(`HTTP 429 after ${attempt} attempts`);
        continue;
      }
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return { status: res.status, html: null };
      const html = await res.text();
      throttle.reward();
      return { status: res.status, html };
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      const wait = Math.min(60_000, 2000 * 2 ** (attempt - 1));
      console.warn(`  ! ${err.message} on ${url} — retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
}

// ---------------------------------------------------------------- parsing helpers
const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();

const isRegionalIndicator = (ch) => {
  const cp = ch.codePointAt(0);
  return cp >= 0x1f1e6 && cp <= 0x1f1ff;
};

/** "🇨🇦 Canada" -> { code: "CA", name: "Canada" }, "🌏 Remote" -> { code: null, name: "Remote" } */
function parseCountry(text) {
  const chars = [...clean(text)];
  if (!chars.length) return { code: null, name: null };
  let code = null;
  let i = 0;
  if (chars.length >= 2 && isRegionalIndicator(chars[0]) && isRegionalIndicator(chars[1])) {
    code = String.fromCharCode(chars[0].codePointAt(0) - 0x1f1e6 + 65, chars[1].codePointAt(0) - 0x1f1e6 + 65);
    i = 2;
  } else if (chars[0] === "\u{1F3F4}") {
    // subdivision flags (England, Scotland, Wales) are tag sequences
    let tag = "";
    i = 1;
    while (i < chars.length) {
      const cp = chars[i].codePointAt(0);
      if (cp >= 0xe0061 && cp <= 0xe007a) tag += String.fromCharCode(cp - 0xe0000);
      else if (cp !== 0xe007f) break;
      i++;
    }
    if (tag.startsWith("gb")) code = "GB";
  }
  const name = chars.slice(i).join("").replace(/^[^\p{L}]+/u, "").trim() || null;
  if (code === "UK") code = "GB";
  return { code, name };
}

function telegramId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    const last = decodeURIComponent(segs[segs.length - 1] ?? "").replace(/^@+/, "").trim();
    return last || null;
  } catch {
    return null;
  }
}

/** Best-effort real-name hint from a LinkedIn slug: "fredy-alberto-polar-urviola" -> "Fredy Alberto Polar Urviola" */
function nameFromLinkedin(url) {
  if (!url) return null;
  try {
    const segs = new URL(url).pathname.split("/").filter(Boolean);
    let slug = decodeURIComponent(segs[segs.length - 1] ?? "");
    let parts = slug.split(/[-_]+/).filter(Boolean);
    // drop LinkedIn's trailing hash ids like "45915b391" / "a7009b193" / "123"
    while (parts.length && /\d/.test(parts[parts.length - 1])) parts.pop();
    if (parts.length < 2 || parts.some((p) => !/^\p{L}+$/u.test(p))) return null;
    return parts.map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(" ");
  } catch {
    return null;
  }
}

const SOCIAL_KEYS = ["website", "linkedin", "telegram", "github", "twitter", "instagram"];

// ---------------------------------------------------------------- output normalisation
// Applied when building data/engineers.json, so fixes here apply to cached profiles too.

/**
 * Looks like a Telegram username: letters/digits/underscore, 4–32 chars, at least one letter
 * (lenient on purpose — "0x…" and "_…" handles are common). Anything else (full names with spaces,
 * phone numbers, "n/a", ".eth" names) is kept as typed in `telegramInvalid`.
 */
const TG_RE = /^(?=.*[A-Za-z])[A-Za-z0-9_]{4,32}$/;

function normalizeTelegram(url) {
  if (!url) return { telegram: null, telegramId: null, telegramInvalid: null };
  const id = telegramId(url);
  if (id && TG_RE.test(id)) return { telegram: `https://t.me/${id}`, telegramId: id, telegramInvalid: null };
  let raw = url;
  try {
    raw = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, "")) || url;
  } catch {}
  return { telegram: null, telegramId: null, telegramInvalid: raw.trim() || null };
}

const normName = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const NAME_TO_CODE = new Map();
for (let a = 65; a <= 90; a++) {
  for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    const name = regionNames.of(code);
    if (name && name !== code && !NAME_TO_CODE.has(normName(name))) NAME_TO_CODE.set(normName(name), code);
  }
}
const COUNTRY_ALIASES = {
  drc: "CD", "dr congo": "CD", "democratic republic of the congo": "CD", uk: "GB", "great britain": "GB",
  england: "GB", scotland: "GB", wales: "GB", "ivory coast": "CI", "cote d ivoire": "CI", "hong kong sar": "HK",
  "hong kong sar china": "HK", usa: "US", us: "US", "united states of america": "US", america: "US", uae: "AE",
  "united arab emirates": "AE", russia: "RU", "russian federation": "RU", "south korea": "KR", korea: "KR",
  "north korea": "KP", vietnam: "VN", "viet nam": "VN", turkey: "TR", turkiye: "TR", "czech republic": "CZ",
  macau: "MO", "macao sar": "MO", taiwan: "TW", palestine: "PS", "cape verde": "CV", swaziland: "SZ",
  burma: "MM", "the netherlands": "NL", holland: "NL", "republic of the congo": "CG", "congo brazzaville": "CG",
};
const DISPLAY_OVERRIDES = { CD: "DR Congo", CG: "Congo", HK: "Hong Kong", MO: "Macau", CI: "Côte d'Ivoire", MM: "Myanmar" };

/** Fill in a missing ISO code from the country name (e.g. "Drc", "Uk", "Ivory Coast"). */
function normalizeCountry(code, name) {
  if (code) return { code, name: name || DISPLAY_OVERRIDES[code] || regionNames.of(code) };
  if (!name) return { code: null, name: null };
  const key = normName(name);
  const found = COUNTRY_ALIASES[key] || NAME_TO_CODE.get(key);
  return found ? { code: found, name: DISPLAY_OVERRIDES[found] || regionNames.of(found) } : { code: null, name };
}

/**
 * Canonical LinkedIn URL: "https://linkedin.com/in/x" -> "https://www.linkedin.com/in/x/".
 * Repairs doubled segments like "/in/in/x"; non-LinkedIn URLs are returned unchanged.
 */
function normalizeLinkedin(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return url;
    const segs = u.pathname.split("/").filter(Boolean);
    const lastIn = segs.lastIndexOf("in");
    const path = lastIn >= 0 && segs[lastIn + 1] ? `in/${segs[lastIn + 1]}` : segs.join("/");
    return path ? `https://www.linkedin.com/${path}/` : url;
  } catch {
    return url;
  }
}

function normalizeProfile(p) {
  const r = normalizeCountry(p.residencyCode, p.residencyName);
  const n = normalizeCountry(p.nationalityCode, p.nationalityName);
  return {
    ...p,
    linkedin: normalizeLinkedin(p.linkedin),
    residencyCode: r.code,
    residencyName: r.name,
    nationalityCode: n.code,
    nationalityName: n.name,
    ...normalizeTelegram(p.telegram),
  };
}

// ---------------------------------------------------------------- listing pages
function parseListing(html) {
  const $ = cheerio.load(html);
  const cards = [];
  $('a[arial-label^="Visit profile of"]').each((_, el) => {
    const a = $(el);
    const href = a.attr("href");
    if (!href?.startsWith("/@")) return;
    const card = a.closest(".card");
    const flagText = clean(a.find('p[style*="right: 0"]').text());
    const body = card.find(".card-body");
    const img = a.find("img").first();
    const imgSrc = (img.attr("data-src") || img.attr("src") || "").trim();
    const avatar = !imgSrc || /\/1pix\.png$/.test(imgSrc) ? null : imgSrc.startsWith("/") ? `${BASE}${imgSrc}` : imgSrc;
    cards.push({
      id: href,
      avatar,
      cardName: clean(body.find("h4").first().text()),
      cardRole: clean(body.find("p").eq(0).text()),
      cardExperience: clean(body.find("p").eq(1).text()),
      cardSalary: clean(a.find('p[style*="left: 0"]').text()) || null,
      cardFlagCode: parseCountry(flagText).code,
      verified: card.find('[style*="verified"]').length > 0,
    });
  });
  const hasNext = $("li.page-item.next a[rel=next]").length > 0;
  return { cards, hasNext };
}

async function crawlListing() {
  const cards = new Map();
  let page = 1;
  let done = false;
  console.log(`Crawling listing ${BASE}${LIST_PATH} ...`);
  while (!done && page <= MAX_PAGES) {
    const batch = [];
    for (let i = 0; i < CONCURRENCY && page + i <= MAX_PAGES; i++) batch.push(page + i);
    const results = await Promise.all(
      batch.map(async (p, idx) => {
        await sleep(idx * jitter(throttle.delay / 2));
        const { html } = await fetchHtml(`${BASE}${LIST_PATH}?page=${p}`);
        return { p, ...(html ? parseListing(html) : { cards: [], hasNext: false }) };
      })
    );
    for (const r of results) {
      for (const c of r.cards) if (!cards.has(c.id)) cards.set(c.id, { ...c, listingPage: r.p, rank: cards.size + 1 });
      if (!r.hasNext || r.cards.length === 0) {
        done = true;
        break;
      }
    }
    page += batch.length;
    if ((page - 1) % 20 < CONCURRENCY) console.log(`  page ${page - 1}: ${cards.size} profiles so far`);
    await sleep(jitter(throttle.delay));
  }
  console.log(`Listing done: ${cards.size} unique profiles across ~${page - 1} pages.`);
  return { cards: [...cards.values()], complete: done };
}

// ---------------------------------------------------------------- profile pages
function parseProfile(html, id) {
  const $ = cheerio.load(html);
  const title = clean($("title").text());
  const tm = title.match(/^(.*?) in (.*?): @(.*?) \|/);
  const username = tm?.[3] ? tm[3].trim() : null;
  const category = tm?.[1] ?? null;

  const h1 = $("h1").first();
  const headline = clean(h1.parent().next("div").find("p").first().text()) || null;

  const socials = {};
  $("a[alt][href]").each((_, el) => {
    const key = ($(el).attr("alt") || "").toLowerCase().trim();
    const href = ($(el).attr("href") || "").trim();
    if (SOCIAL_KEYS.includes(key) && /^https?:\/\//i.test(href) && !socials[key]) socials[key] = href;
  });

  const fields = {};
  $("p").each((_, el) => {
    const t = clean($(el).text());
    const m = t.match(/^(Experience|Yearly salary|Hourly rate|Nationality|Residency):\s*(.*)$/);
    if (m && !(m[1] in fields)) fields[m[1]] = m[2];
  });
  const residency = parseCountry(fields["Residency"]);
  const nationality = parseCountry(fields["Nationality"]);
  const money = (v) => (v && !/^\$?0$/.test(v.replace(/[,\s]/g, "")) ? v : null);

  const skillsH3 = $("h3").filter((_, el) => clean($(el).text()) === "Skills").first();
  const skillDivs = skillsH3.nextAll("div").slice(0, 2);
  const skills = skillDivs.find(".badge.bg-secondary").map((_, el) => clean($(el).text())).get();
  const languages = skillDivs.find(".badge.bg-grey").map((_, el) => clean($(el).text())).get();

  const expH3 = $("h3").filter((_, el) => clean($(el).text()) === "Experience").first();
  const job = expH3.next("div");
  const jobTitle = clean(job.find("h5").first().text());
  const jobCompany = clean(job.find("a").first().text());
  const jobDates = clean(job.find("small").first().text());
  const latestJob = jobTitle ? [jobTitle, jobCompany && `@ ${jobCompany}`, jobDates && `(${jobDates})`].filter(Boolean).join(" ") : null;

  const bio = clean($(".trix-content").first().text()).slice(0, 1000) || null;
  const anonId = id.match(/id=(\d+)/)?.[1];

  return {
    username,
    name: username || (anonId ? `Anonymous #${anonId}` : null),
    linkedinName: nameFromLinkedin(socials.linkedin),
    headline,
    category,
    experience: fields["Experience"] || null,
    yearlySalary: money(fields["Yearly salary"]),
    hourlyRate: money(fields["Hourly rate"]),
    residencyCode: residency.code,
    residencyName: residency.name,
    nationalityCode: nationality.code,
    nationalityName: nationality.name,
    linkedin: socials.linkedin ?? null,
    telegram: socials.telegram ?? null,
    telegramId: telegramId(socials.telegram),
    github: socials.github ?? null,
    website: socials.website ?? null,
    twitter: socials.twitter ?? null,
    instagram: socials.instagram ?? null,
    skills,
    languages,
    latestJob,
    bio,
  };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 1));
  await fs.rename(tmp, file);
}

async function fetchProfiles(cards, cache) {
  const todo = cards.filter((c) => !cache[c.id] || cache[c.id].error);
  console.log(`Fetching ${todo.length} profiles (${cards.length - todo.length} cached), concurrency=${CONCURRENCY}, delay=${DELAY_MS}ms`);
  let next = 0;
  let done = 0;
  let failed = 0;
  const started = Date.now();
  let lastSave = Date.now();

  async function worker(w) {
    await sleep(w * 150);
    while (next < todo.length) {
      const card = todo[next++];
      try {
        const { status, html } = await fetchHtml(`${BASE}${card.id}`);
        cache[card.id] = html ? { ...parseProfile(html, card.id), fetchedAt: new Date().toISOString() } : { error: `HTTP ${status}` };
      } catch (err) {
        cache[card.id] = { error: String(err.message || err) };
        failed++;
      }
      done++;
      if (done % 100 === 0 || done === todo.length) {
        const rate = done / ((Date.now() - started) / 1000);
        const eta = Math.round((todo.length - done) / rate);
        console.log(
          `  ${done}/${todo.length} profiles (${rate.toFixed(2)}/s, ~${Math.floor(eta / 60)}m${eta % 60}s left, ${failed} errors, delay ${throttle.delay}ms)`
        );
      }
      if (Date.now() - lastSave > 15_000) {
        lastSave = Date.now();
        await writeJsonAtomic(PROFILE_CACHE, cache);
      }
      await sleep(jitter(throttle.delay));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, w) => worker(w)));
  await writeJsonAtomic(PROFILE_CACHE, cache);
}

// ---------------------------------------------------------------- main
async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cache = FRESH ? {} : await readJson(PROFILE_CACHE, {});

  let cards;
  const listing = RELIST ? null : await readJson(LISTING_CACHE, null);
  if (listing?.complete && Date.now() - Date.parse(listing.crawledAt) < LISTING_MAX_AGE_MS && !argv.includes("--max-pages")) {
    cards = listing.cards;
    console.log(`Using cached listing from ${listing.crawledAt}: ${cards.length} profiles (pass --relist to re-crawl).`);
  } else {
    const res = await crawlListing();
    cards = res.cards;
    await writeJsonAtomic(LISTING_CACHE, { crawledAt: new Date().toISOString(), complete: res.complete, cards });
  }
  if (!cards.length) throw new Error("No profiles found on the listing page — the site layout may have changed.");
  await fetchProfiles(cards, cache);

  const engineers = cards.map((c) => {
    const p = cache[c.id] && !cache[c.id].error ? cache[c.id] : null;
    return {
      id: c.id,
      profileUrl: `${BASE}${c.id}`,
      rank: c.rank,
      avatar: c.avatar ?? null,
      verified: c.verified,
      cardFlagCode: c.cardFlagCode,
      ...(p ? normalizeProfile(p) : {
        name: c.cardName || null,
        headline: c.cardRole || null,
        experience: c.cardExperience?.replace(/ of experience$/, "") || null,
        fetchError: cache[c.id]?.error ?? "not fetched",
      }),
    };
  });

  const out = {
    source: `${BASE}${LIST_PATH}`,
    scrapedAt: new Date().toISOString(),
    total: engineers.length,
    failed: engineers.filter((e) => e.fetchError).length,
    engineers,
  };
  await writeJsonAtomic(OUT_FILE, out);
  console.log(`\nWrote ${engineers.length} engineers to ${path.relative(ROOT, OUT_FILE)} (${out.failed} without profile details).`);
}

main().catch((err) => {
  console.error("Scrape failed:", err);
  process.exit(1);
});

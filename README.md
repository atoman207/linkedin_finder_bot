# Blockchain Engineer Finder

Scrapes the public candidate profiles on <https://web3.career/hire/blockchain> and shows them in a
Next.js app grouped by region → country (Americas first), with CSV export.

## Usage

```bash
npm install
npm run scrape               # crawl listing + every profile -> data/engineers.json (~1 h first time)
npm run build && npm start   # or: npm run dev
# open http://localhost:3000
```

Re-running `npm run scrape` reuses the listing crawl if it's under 24 h old and only fetches profiles that
aren't cached yet (`data/cache/`), so it's quick and resumable.

| Flag | Effect |
| --- | --- |
| `--relist` | re-crawl the listing pages (picks up new candidates and avatars) |
| `--fresh` | ignore all caches and refetch everything |
| `--concurrency 2` / `--delay 800` | parallel requests / ms between requests per worker |

The site rate-limits (HTTP 429) aggressive crawling; the scraper pauses all workers and slows down
automatically when that happens.

## Deploying (Vercel)

No database. The hiring dataset is committed in git and deployed as static files on Vercel:

- `public/data/snapshot.json` — what the live site loads (`/data/snapshot.json`), 2,971 LinkedIn-ready engineers
- `data/snapshot.json` — same filtered snapshot (source of truth)
- `data/engineers.json` — full scrape (all profiles before LinkedIn/country filters)
- `data/cache/` — scrape caches for resumable updates
- `data/exports/` — CSV exports used for outreach

1. Keep the GitHub repo **private** (contact details for recruiting outreach).
2. Push to `main` — Vercel redeploys automatically and serves the committed snapshot as-is.
3. Optional password: in Vercel → Settings → Environment Variables set `SITE_PASSWORD` (and optionally
   `SITE_USER`, default `admin`), then redeploy (`proxy.ts`).

To refresh later: `npm run scrape`, then optionally `npm run check:linkedin` (drops LinkedIn 404 /
suspended profiles), then commit the updated `data/` + `public/data/` files and push.
Search engines are told not to index the site (`robots.txt` + `noindex`).

## Who is shown — `lib/config.ts`

```ts
export const HIDDEN_COUNTRIES = new Set(["KR"]); // South Korea removed
export const REQUIRE_LINKEDIN = true;            // engineers without LinkedIn removed
```

These rules apply to every tab, count and CSV export. The local `data/engineers.json` still holds the full
scrape, so changing a rule and running `npm run snapshot` (then rebuild/redeploy) brings people back without
re-scraping.

## App

- **Regions**: Americas · Europe · Asia & Middle East · Africa · Oceania · Remote/Unknown — each with its own colour
  theme; **country tabs** inside each, sorted by headcount
- **All <region>** view has a **Choose countries** picker (grouped by subregion, with "only Southeast Asia"-style shortcuts)
- **LinkedIn**: full clickable URL (`https://www.linkedin.com/in/<name>/`) with a **Copy** button that turns
  **red** once copied. Copied marks are remembered in this browser (localStorage); "Clear copied marks" resets them
- **Avatars** from web3.career / Gravatar (coloured initials when there is no photo)
- Search (name, skill, role, country, Telegram), "must have Telegram/GitHub/Website" filters, sorting
- **Download this view** (respects filters) or **Download all** (Americas first) as CSV
- Responsive: table on desktop, cards on phones/tablets; animations respect "reduce motion"
- Views are bookmarkable, e.g. `/?region=asia&country=all&exclude=CN&has=telegram`

CSV files are UTF-8 with BOM (open cleanly in Excel); cells that start with `= + - @` are prefixed with `'`
to prevent spreadsheet formula injection.

## What is collected

| Field | Source on web3.career |
| --- | --- |
| Name | Username on the profile (the site doesn't publish real names; anonymous profiles show as `Anonymous #id`) |
| Name (from LinkedIn URL) | Best-effort guess parsed from the LinkedIn slug, e.g. `in/fredy-alberto-polar` → "Fredy Alberto Polar" |
| LinkedIn / Telegram / GitHub / Website / Twitter | Links the candidate added (Telegram entries that aren't usernames — full names, phone numbers — go in a separate column) |
| Country | Residency, falling back to nationality |
| Avatar, headline, category, experience, salary, skills, languages, latest job | Profile / listing card |

## Notes

- Committed data holds personal contact details — keep the repo private and use it only for recruiting
  outreach (e.g. GDPR for EU residents).
- If web3.career changes its HTML, update `parseListing` / `parseProfile` in `scripts/scrape.mjs`.

# Blockchain Engineer Finder

Scrapes the public candidate profiles on <https://web3.career/hire/blockchain> and shows them in a
Next.js app grouped by region → country (Americas first), with CSV export.

## Usage

```bash
npm install
npm run scrape        # crawl listing + every profile -> data/engineers.json  (~30 min for ~3,900 profiles)
npm run build && npm start   # or: npm run dev
# open http://localhost:3000
```

Re-running `npm run scrape` re-crawls the listing and only fetches profiles that aren't cached yet
(`data/cache/profiles.json`), so it's quick and resumable. Use `npm run scrape -- --fresh` to refetch everything.

Options: `--concurrency 4` (parallel requests), `--delay 250` (ms between requests per worker), `--max-pages N`.

## What is collected

| Field | Source on web3.career |
| --- | --- |
| Name | Username shown on the profile (the site doesn't publish real names; anonymous profiles show as `Anonymous #id`) |
| Name (from LinkedIn URL) | Best-effort guess parsed from the LinkedIn slug, e.g. `in/fredy-alberto-polar` → "Fredy Alberto Polar" |
| LinkedIn / Telegram / GitHub / Website / Twitter | Social links the candidate added to their profile (blank if they didn't add one) |
| Country | Residency, falling back to nationality |
| Headline, category, experience, salary, skills, languages, latest job | Profile details |

## App

- **Region bar**: Americas · Europe · Asia & Middle East · Africa · Oceania · Remote/Unknown
- **Country tabs** inside each region, sorted by number of engineers (plus an "All <region>" tab)
- Search (name, skills, role, Telegram), "must have LinkedIn/Telegram/GitHub/Website" filters, sorting
- **Download CSV** for the current tab (respects filters) or **Download all** (sorted Americas first)

CSV files are UTF-8 with BOM (open cleanly in Excel); cells that start with `= + - @` are prefixed with `'`
to prevent spreadsheet formula injection.

## Notes

- `data/` holds personal contact details and is git-ignored. Use it only for recruiting outreach and
  handle it per your privacy obligations (e.g. GDPR for EU residents).
- If web3.career changes its HTML, the parsers in `scripts/scrape.mjs` (`parseListing`, `parseProfile`) are the
  places to update.

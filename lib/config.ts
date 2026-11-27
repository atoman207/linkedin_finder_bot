/**
 * Which scraped engineers the app shows and exports.
 * These rules are applied when building data/snapshot.json (what Vercel deploys) and again in the
 * UI, so they affect every tab, count and CSV download. After editing: `npm run snapshot`, then
 * rebuild/redeploy. For LinkedIn 404/suspended: `npm run check:linkedin && npm run snapshot`.
 */

/** Countries removed entirely (ISO codes, matched on where the engineer is based). */
export const HIDDEN_COUNTRIES = new Set<string>([
  "KR", // South Korea
]);

/** Drop engineers who have no LinkedIn URL on their profile. */
export const REQUIRE_LINKEDIN = true;

/** Drop LinkedIn URLs that 404, are suspended, or are known placeholder slugs. */
export const HIDE_DEAD_LINKEDIN = true;

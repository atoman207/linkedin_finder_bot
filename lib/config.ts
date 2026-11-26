/**
 * Which scraped engineers the app shows and exports.
 * data/engineers.json (local only) keeps everyone. These rules are applied when building
 * data/snapshot.json — the file the app serves and Vercel deploys — and again in the UI, so they
 * affect every tab, count and CSV download. After editing: `npm run snapshot`, then rebuild/redeploy.
 */

/** Countries removed entirely (ISO codes, matched on where the engineer is based). */
export const HIDDEN_COUNTRIES = new Set<string>([
  "KR", // South Korea
]);

/** Drop engineers who have no LinkedIn URL on their profile. */
export const REQUIRE_LINKEDIN = true;

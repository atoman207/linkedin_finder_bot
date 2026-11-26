/**
 * Which scraped engineers the app shows and exports.
 * data/engineers.json keeps everyone; these rules are applied when the app loads it,
 * so they affect every tab, count and CSV download. Edit and rebuild to change them.
 */

/** Countries removed entirely (ISO codes, matched on where the engineer is based). */
export const HIDDEN_COUNTRIES = new Set<string>([
  "KR", // South Korea
]);

/** Drop engineers who have no LinkedIn URL on their profile. */
export const REQUIRE_LINKEDIN = true;

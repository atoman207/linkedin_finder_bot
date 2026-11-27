/** Placeholder / non-profile LinkedIn slugs that should never be shown. */
export const BAD_LINKEDIN_SLUGS = new Set([
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

export function linkedinSlug(url: string | null | undefined): string | null {
  if (!url) return null;
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

/** True when LinkedIn is missing, a known-bad slug, or marked dead by check:linkedin. */
export function isDeadLinkedin(e: {
  linkedin?: string | null;
  linkedinStatus?: string | null;
}): boolean {
  if (e.linkedinStatus === "dead") return true;
  if (!e.linkedin) return true;
  const slug = linkedinSlug(e.linkedin);
  if (!slug || BAD_LINKEDIN_SLUGS.has(slug) || slug.length < 2) return true;
  return false;
}

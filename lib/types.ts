export interface Engineer {
  id: string;
  profileUrl: string;
  rank: number;
  /** Absolute avatar image URL (web3.career upload or Gravatar) */
  avatar?: string | null;
  verified: boolean;
  cardFlagCode: string | null;
  username?: string | null;
  name: string | null;
  linkedinName?: string | null;
  headline?: string | null;
  category?: string | null;
  experience?: string | null;
  yearlySalary?: string | null;
  hourlyRate?: string | null;
  residencyCode?: string | null;
  residencyName?: string | null;
  nationalityCode?: string | null;
  nationalityName?: string | null;
  linkedin?: string | null;
  telegram?: string | null;
  telegramId?: string | null;
  /** What the candidate typed when it isn't a valid Telegram username (e.g. "John John") */
  telegramInvalid?: string | null;
  github?: string | null;
  website?: string | null;
  twitter?: string | null;
  instagram?: string | null;
  skills?: string[];
  languages?: string[];
  latestJob?: string | null;
  bio?: string | null;
  fetchError?: string;
}

export interface Dataset {
  source: string;
  scrapedAt: string;
  total: number;
  failed: number;
  engineers: Engineer[];
}

export interface CountryInfo {
  /** ISO code, or "REMOTE" / "UNKNOWN" */
  key: string;
  code: string | null;
  name: string;
}

export type RegionId = "americas" | "europe" | "asia" | "africa" | "oceania" | "other";

export interface Row extends Engineer {
  country: CountryInfo;
  region: RegionId;
}

/** A row prepared for the UI: lower-cased search text, numeric experience, contact-link count. */
export type Item = Row & { search: string; years: number; contactCount: number };

export type ContactKey = "linkedin" | "telegram" | "github" | "website";

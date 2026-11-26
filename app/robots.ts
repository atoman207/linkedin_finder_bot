import type { MetadataRoute } from "next";

/** Keep this personal-data directory out of search engines. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}

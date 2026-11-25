import type { MetadataRoute } from "next";

/** The production address Vercel sets (a custom domain once there is one); localhost elsewhere. */
export const SITE = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

/** The public pages; everything else needs an account. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/pricing", "/privacy", "/terms"].map((path) => ({ url: `${SITE}${path}` }));
}

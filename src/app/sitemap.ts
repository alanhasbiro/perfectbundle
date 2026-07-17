import type { MetadataRoute } from "next";

const BASE_URL = "https://perfectbundle.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    {
      url: `${BASE_URL}/quiz`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/trending`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    // /b/[id] and /quiz/results are per-user/dynamic — intentionally excluded
    // from the static sitemap; /b/[id] pages are discoverable via share links
    // and already carry their own generateMetadata OG tags.
  ];
}

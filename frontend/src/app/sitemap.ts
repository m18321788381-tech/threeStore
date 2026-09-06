import type { MetadataRoute } from "next";
import { serverGet } from "@/lib/api";
import { siteConfig } from "@/lib/site";
import type { Paginated, PostListItem } from "@/types";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url.replace(/\/$/, "");

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${base}/archive`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/categories`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/tags`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/garden`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.4 },
  ];

  const data = await serverGet<Paginated<PostListItem>>("/posts", {
    params: { page: 1, page_size: 500 },
    revalidate: 3600,
  });

  const postRoutes: MetadataRoute.Sitemap = (data?.items || []).map((post) => ({
    url: `${base}/posts/${post.slug}`,
    lastModified: post.updated_at ? new Date(post.updated_at) : new Date(),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...postRoutes];
}

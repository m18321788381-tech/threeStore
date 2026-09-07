import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { serverGet } from "@/lib/api";
import { siteConfig } from "@/lib/site";
import { formatDate, readingTimeLabel } from "@/lib/utils";
import { PostContent } from "@/components/post/PostContent";
import { PostPager } from "@/components/post/PostPager";
import { ViewCounter } from "@/components/post/ViewCounter";
import { TOC } from "@/components/post/TOC";
import { CommentSection } from "@/components/comment/CommentSection";
import { Backlinks } from "@/components/garden/Backlinks";
import type { PostDetail, LinkData } from "@/types";

export const revalidate = 300; // 详情内容变更不频繁，5 分钟 ISR

type Props = { params: Promise<{ slug: string }> };

async function getPost(slug: string) {
  return serverGet<PostDetail>(`/posts/${slug}`, { revalidate: 300 });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "文章不存在" };

  const description = post.summary || post.title;
  // 动态 OG 卡片：由 /og 路由实时生成，带内容指纹以便更新后自动失效
  const stamp = Date.parse(post.updated_at || post.published_at || "") || 0;
  const ogParams = new URLSearchParams({
    title: post.title,
    author: post.author?.display_name || siteConfig.author,
    tag: post.category?.name || (post.tags?.[0]?.name ?? ""),
    v: String(stamp),
  });
  const ogImage = `/og?${ogParams.toString()}`;

  return {
    title: post.title,
    description,
    keywords: (post.tags || []).map((t) => t.name),
    authors: [{ name: post.author?.display_name || siteConfig.author }],
    alternates: { canonical: `/posts/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: `/posts/${post.slug}`,
      publishedTime: post.published_at || undefined,
      modifiedTime: post.updated_at || undefined,
      tags: (post.tags || []).map((t) => t.name),
      images: [{ url: ogImage, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
      images: [ogImage],
    },
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const links = await serverGet<LinkData>(`/posts/${slug}/links`, { revalidate: 300 });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.summary,
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    author: {
      "@type": "Person",
      name: post.author?.display_name || siteConfig.author,
    },
    publisher: { "@type": "Organization", name: siteConfig.title },
    mainEntityOfPage: { "@type": "WebPage", "@id": `/posts/${post.slug}` },
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_220px]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="min-w-0">
        <header className="mb-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <time dateTime={post.published_at || undefined}>
              {formatDate(post.published_at)}
            </time>
            <span aria-hidden>·</span>
            <span>{readingTimeLabel(post.reading_time)}</span>
            <span aria-hidden>·</span>
            <span>{post.view_count} 次阅读</span>
            {post.category && (
              <>
                <span aria-hidden>·</span>
                <Link href={`/categories/${post.category.slug}`} className="hover:text-accent">
                  {post.category.name}
                </Link>
              </>
            )}
          </div>

          <h1 className="page-title mt-4 sm:text-[2.125rem]">
            {post.title}
          </h1>

          {post.summary && (
            <p className="mt-5 border-l-2 border-accent/60 pl-4 text-lead leading-relaxed text-muted">
              {post.summary}
            </p>
          )}

          {(post.tags || []).length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Link key={tag.slug} href={`/tags/${tag.slug}`} className="chip">
                  #{tag.name}
                </Link>
              ))}
            </div>
          )}
        </header>

        <PostContent html={post.content_html} />

        <ViewCounter slug={post.slug} />

        {links && <Backlinks data={links} />}

        <PostPager prev={post.prev} next={post.next} />

        <CommentSection slug={post.slug} />
      </article>

      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pb-6">
          <TOC items={post.toc || []} />
        </div>
      </aside>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "关于",
  description: `关于 ${siteConfig.author} 与这个博客的技术实现`,
};

const stack = [
  { label: "前端", value: "Next.js 15（App Router）· TypeScript · Tailwind CSS" },
  { label: "后端", value: "FastAPI · SQLAlchemy 2.0（async）· Alembic" },
  { label: "数据库", value: "PostgreSQL 16" },
  { label: "部署", value: "Docker Compose · Nginx 反代 · Let's Encrypt" },
  { label: "Markdown", value: "markdown-it-py + Pygments + bleach 白名单过滤" },
];

const features = [
  {
    title: "Markdown 写作，写时渲染",
    body: "正文存 content_md，保存时预渲染成 content_html 与目录缓存。读详情页零渲染成本，首屏不被 Markdown 解析拖慢。",
  },
  {
    title: "数字花园 / 双向链接",
    body: "用 [[笔记名]] 引用另一篇文章，保存时自动建立关系。文末会出现「引用本文的笔记」，图谱页能看到整张知识网络。",
  },
  {
    title: "动态 OG 分享卡片",
    body: "每篇文章的社交分享图由 /og 路由按标题、作者、标签实时生成，改了内容指纹就变，不用手工做封面。",
  },
  {
    title: "评论自建 + 审核",
    body: "访客评论默认待审，博主评论自动通过并可置顶；支持楼中楼多级回复，带频率限制与链接数校验。",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-content">
      <header className="page-head">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-panel bg-accent text-xl font-bold text-on-accent">
            {siteConfig.author.slice(0, 1)}
          </span>
          <div>
            <h1 className="page-title">关于</h1>
            <p className="page-desc">{siteConfig.author}</p>
          </div>
        </div>
        <p className="mt-6 text-lead text-muted">{siteConfig.bio}</p>
      </header>

      <section className="mb-14">
        <h2 className="section-title">这个站点</h2>
        <div className="prose-blog mt-4">
          <p>
            这是一个单作者的内容站点。没有点赞、没有推荐算法、没有信息流 ——
            只有一个按时间归档的文章列表，和一张把它们连起来的知识网络。
          </p>
          <p>
            写作的优先级高于一切：Markdown 源文件是唯一可信源，
            哪天想迁站，把它导出来就能走，不会被某个框架的 HTML 绑死。
          </p>
        </div>
      </section>

      <section className="mb-14">
        <h2 className="section-title">实现要点</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {features.map((item) => (
            <div key={item.title} className="card p-5">
              <h3 className="text-body font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-14">
        <h2 className="section-title">技术栈</h2>
        <dl className="mt-5 divide-y divide-border border-y border-border">
          {stack.map((row) => (
            <div key={row.label} className="grid gap-1 py-3 sm:grid-cols-[120px_1fr] sm:gap-4">
              <dt className="text-sm font-medium text-muted">{row.label}</dt>
              <dd className="font-mono text-meta">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="section-title">联系与订阅</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href="/feed.xml" className="btn-primary">
            RSS 订阅
          </a>
          {siteConfig.social.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target={item.href.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="btn-ghost"
            >
              {item.label}
            </a>
          ))}
          <Link href="/archive" className="btn-ghost">
            浏览全部文章
          </Link>
        </div>
        <p className="mt-6 text-sm text-muted">
          发现页面有问题？欢迎在任意文章下留言，或者直接给
          <a href="mailto:admin@example.com" className="mx-1 text-accent underline">
            admin@example.com
          </a>
          写信。
        </p>
      </section>
    </div>
  );
}

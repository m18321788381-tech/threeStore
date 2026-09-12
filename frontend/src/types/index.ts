export interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface Ref {
  id: string;
  name: string;
  slug: string;
}

export interface Author {
  id: string;
  username: string;
  display_name: string;
  avatar: string;
}

export interface PostListItem {
  id: string;
  title: string;
  slug: string;
  summary: string;
  cover_url: string;
  status: number;
  /** 置顶：仅影响列表页排序（始终最前） */
  is_pinned: boolean;
  /** SEO 覆盖：留空时使用本站规范路径 */
  canonical_url: string;
  /** SEO 覆盖：为 true 时输出 robots noindex */
  noindex: boolean;
  view_count: number;
  reading_time: number;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  category: Ref | null;
  tags: Ref[];
  author: Author | null;
  comment_count: number;
}

/** 搜索结果项：后端额外返回正文命中片段（已转义，仅含 <mark>） */
export interface PostSearchItem extends PostListItem {
  highlight?: string;
}

export interface TocItem {
  level: number;
  text: string;
  anchor: string;
}

export interface PostDetail extends PostListItem {
  content_md: string;
  content_html: string;
  toc: TocItem[];
  prev: Ref | null;
  next: Ref | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  parent_id: string | null;
  post_count: number;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  post_count: number;
}

export interface CommentNode {
  id: string;
  author_name: string;
  author_site: string;
  content: string;
  created_at: string | null;
  parent_id: string | null;
  is_author: boolean;
  is_pinned: boolean;
  status: number;
  replies: CommentNode[];
}

export interface AdminComment extends CommentNode {
  author_email: string;
  ip_address: string;
  post_slug: string;
  post_title: string;
}

export interface ArchiveGroup {
  year: string;
  month: string;
  key: string;
  items: Array<{
    id: string;
    title: string;
    slug: string;
    published_at: string;
    day: string;
  }>;
}

export interface GraphNode {
  id: string;
  title: string;
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface LinkData {
  outbound: Array<{ slug: string; title: string; summary: string }>;
  backlinks: Array<{
    slug: string;
    title: string;
    summary: string;
    published_at: string | null;
  }>;
}

export interface StatsOverview {
  post_count: number;
  published_count: number;
  draft_count: number;
  comment_count: number;
  pending_comment_count: number;
  category_count: number;
  tag_count: number;
  media_count: number;
  total_views: number;
  link_count: number;
}

export interface MediaItem {
  id: string;
  filename: string;
  url: string;
  /** 图片替代文本，可在媒体库编辑 */
  alt: string;
  mime_type: string;
  size: number;
  /** 像素尺寸：0 表示未采集到（如 SVG 无唯一像素尺寸） */
  width: number;
  height: number;
  created_at: string | null;
}

export interface AdminPost extends PostListItem {
  content_md: string;
}

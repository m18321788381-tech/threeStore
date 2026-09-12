import type {
  ApiEnvelope,
  Paginated,
  PostDetail,
  PostListItem,
  PostSearchItem,
  Category,
  Tag,
  ArchiveGroup,
  CommentNode,
  GraphData,
  LinkData,
  StatsOverview,
  MediaItem,
  AdminComment,
} from "@/types";

/**
 * 渲染模式对应设计文档 §5.4「模式 A」：
 * Server Component 直接用内网地址访问 backend；浏览器侧走同源 /api（由 next.config 反代）。
 */
export const INTERNAL_API =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export const API_PREFIX = process.env.NEXT_PUBLIC_API_PREFIX || "/api/v1";

/**
 * 拼接请求地址。base 传空串表示浏览器侧同源请求（由 next.config 反代到 backend），
 * 此时必须给 URL 一个绝对基底，否则 new URL("/api/v1/...") 会抛 Invalid URL。
 */
export function buildUrl(
  base: string,
  path: string,
  params?: Record<string, string | number | undefined | null>
) {
  const origin =
    typeof window === "undefined" ? INTERNAL_API : window.location.origin;
  const url = new URL(`${base}${path}`, origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

function unwrap<T>(payload: unknown): T | null {
  if (!payload) return null;
  if (
    typeof payload === "object" &&
    payload !== null &&
    "code" in payload &&
    "data" in payload
  ) {
    return (payload as ApiEnvelope<T>).data;
  }
  return payload as T;
}

/* -------------------------------------------------------------- 服务端取数 */
/**
 * Server Component 专用。**失败返回 null 而不抛错** —— 保证后端未就绪时
 * `next build` 仍能完成预渲染，线上运行时再拿到真实数据。
 *
 * `token` 用于服务端鉴权守卫：Server Component 读不到 localStorage，
 * 因此登录态同时会写入 cookie（见 setAuthToken），这里带上它去后端校验。
 */
export async function serverGet<T>(
  path: string,
  options: {
    params?: Record<string, string | number | undefined | null>;
    revalidate?: number;
    tags?: string[];
    token?: string;
  } = {}
): Promise<T | null> {
  const { params, revalidate = 60, tags, token } = options;
  try {
    const res = await fetch(buildUrl(INTERNAL_API, `${API_PREFIX}${path}`, params), {
      next: { revalidate, tags },
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) return null;
    return unwrap<T>(await res.json());
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------- 客户端取数 */
export function authToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("blog_token");
}

export function setAuthToken(token: string | null) {
  if (typeof window === "undefined") return;

  if (token) {
    window.localStorage.setItem("blog_token", token);
    // 同步写入 cookie：Server Component 读不到 localStorage，
    // 后台布局的服务端守卫依赖它来判断登录态。
    // Secure 只在 HTTPS 下加：HTTP 站点加 Secure 浏览器会直接丢弃该 cookie，
    // 表现为「登录成功但一进后台就被踢回登录页」。
    const secure =
      typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
    document.cookie = `blog_token=${token}; path=/; max-age=43200; samesite=lax${secure}`;
  } else {
    window.localStorage.removeItem("blog_token");
    document.cookie = "blog_token=; path=/; max-age=0; samesite=lax";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string | number | undefined | null>
): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(buildUrl("", `${API_PREFIX}${path}`, params), {
    method,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(authToken() ? { Authorization: `Bearer ${authToken()}` } : {}),
    },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* 空响应体 */
  }
  if (!res.ok) {
    const message =
      (payload as ApiEnvelope<null>)?.message || `请求失败（${res.status}）`;
    throw new Error(message);
  }
  const data = unwrap<T>(payload);
  return data as T;
}

export const api = {
  /* 文章 */
  posts: (params?: Record<string, string | number | undefined>) =>
    request<Paginated<PostListItem>>("GET", "/posts", undefined, params),
  post: (slug: string) => request<PostDetail>("GET", `/posts/${slug}`),
  adminPost: (id: string) => request<PostDetail>("GET", `/posts/admin/${id}`),
  archive: () =>
    request<{ groups: ArchiveGroup[]; total: number }>("GET", "/posts/archive"),
  view: (slug: string) =>
    request<{ view_count: number }>("POST", `/posts/${slug}/view`),
  createPost: (body: unknown) => request<{ id: string; slug: string }>("POST", "/posts", body),
  updatePost: (id: string, body: unknown) =>
    request<{ id: string; slug: string }>("PUT", `/posts/${id}`, body),
  deletePost: (id: string) => request<{ id: string }>("DELETE", `/posts/${id}`),
  publishPost: (id: string, status: number) =>
    request<{ id: string; status: number }>("POST", `/posts/${id}/publish`, { status }),

  /* 分类 / 标签 */
  categories: () => request<Category[]>("GET", "/categories"),
  createCategory: (body: unknown) => request<Category>("POST", "/categories", body),
  updateCategory: (id: string, body: unknown) =>
    request<Category>("PUT", `/categories/${id}`, body),
  deleteCategory: (id: string) => request<{ id: string }>("DELETE", `/categories/${id}`),
  tags: () => request<Tag[]>("GET", "/tags"),
  createTag: (body: unknown) => request<Tag>("POST", "/tags", body),
  updateTag: (id: string, body: unknown) => request<Tag>("PUT", `/tags/${id}`, body),
  deleteTag: (id: string) => request<{ id: string }>("DELETE", `/tags/${id}`),

  /* 搜索 */
  search: (q: string, page = 1, page_size = 10) =>
    request<Paginated<PostSearchItem> & { keyword: string }>("GET", "/search", undefined, {
      q,
      page,
      page_size,
    }),

  /* 评论 */
  comments: (slug: string, page = 1, page_size = 20) =>
    request<Paginated<CommentNode>>("GET", `/posts/${slug}/comments`, undefined, {
      page,
      page_size,
    }),
  createComment: (slug: string, body: unknown) =>
    request<{ id: string; status: number }>("POST", `/posts/${slug}/comments`, body),
  adminComments: (params: Record<string, string | number | undefined>) =>
    request<Paginated<AdminComment>>("GET", "/comments", undefined, params),
  updateComment: (id: string, body: unknown) =>
    request<{ id: string }>("PATCH", `/comments/${id}`, body),
  deleteComment: (id: string) => request<{ id: string }>("DELETE", `/comments/${id}`),

  /* 数字花园 */
  links: (slug: string) => request<LinkData>("GET", `/posts/${slug}/links`),
  graph: () => request<GraphData>("GET", "/garden/graph"),

  /* 后台 */
  stats: () => request<StatsOverview>("GET", "/stats/overview"),
  media: (page = 1, page_size = 24) =>
    request<Paginated<MediaItem>>("GET", "/media", undefined, { page, page_size }),
  upload: (form: FormData) =>
    request<{
      url: string;
      alt: string;
      width: number;
      height: number;
      deduped: boolean;
    }>("POST", "/media/upload", form),
  updateMedia: (id: string, body: { alt: string }) =>
    request<{ id: string; alt: string }>("PATCH", `/media/${id}`, body),
  deleteMedia: (id: string) => request<{ id: string }>("DELETE", `/media/${id}`),
  login: (username: string, password: string) =>
    request<{ access_token: string; refresh_token: string; expires_in: number }>(
      "POST",
      "/auth/login",
      { username, password }
    ),
  me: () =>
    request<{ id: string; username: string; display_name: string; role: number }>(
      "GET",
      "/auth/me"
    ),
};

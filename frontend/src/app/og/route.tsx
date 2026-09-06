import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";
// 注意：route.tsx 只允许导出 HTTP 方法与少量已知字段（runtime/dynamic/revalidate 等），
// 因此 size 作为局部常量使用，不导出（alt/contentType 是 metadata 图片文件专用字段）。
const size = { width: 1200, height: 630 };

/**
 * 动态 OG 卡片：GET /og?title=...&author=...&tag=...&template=default
 * 生成失败时返回兜底 PNG，绝不返回 500 破坏分享。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") || siteConfig.title).slice(0, 90);
  const author = searchParams.get("author") || siteConfig.author;
  const tag = searchParams.get("tag") || "";
  const template = searchParams.get("template") || "default";

  // 标题越长字号越小，最多两行
  const fontSize = title.length > 46 ? 52 : title.length > 26 ? 62 : 72;

  const templates: Record<string, { bg: string; fg: string; accent: string }> = {
    default: { bg: "#0f172a", fg: "#f8fafc", accent: "#60a5fa" },
    tech: { bg: "#0b1120", fg: "#e2e8f0", accent: "#22d3ee" },
    minimal: { bg: "#ffffff", fg: "#1e293b", accent: "#2563eb" },
  };
  const theme = templates[template] || templates.default;
  const isLight = template === "minimal";

  try {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "72px 80px",
            background: isLight
              ? "#ffffff"
              : `linear-gradient(135deg, ${theme.bg} 0%, #1e293b 100%)`,
            color: theme.fg,
            fontFamily: "sans-serif",
            position: "relative",
          }}
        >
          {/* 装饰：右上角光斑 */}
          {!isLight && (
            <div
              style={{
                position: "absolute",
                top: -120,
                right: -100,
                width: 460,
                height: 460,
                borderRadius: 9999,
                background: "rgba(96,165,250,0.18)",
              }}
            />
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: theme.accent,
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              {siteConfig.title.slice(0, 1)}
            </div>
            <div style={{ fontSize: 24, opacity: 0.85 }}>{siteConfig.title}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {tag && (
              <div
                style={{
                  alignSelf: "flex-start",
                  marginBottom: 22,
                  padding: "8px 18px",
                  borderRadius: 999,
                  background: isLight ? "rgba(37,99,235,0.10)" : "rgba(96,165,250,0.18)",
                  color: theme.accent,
                  fontSize: 24,
                }}
              >
                {tag}
              </div>
            )}
            <div
              style={{
                fontSize,
                fontWeight: 700,
                lineHeight: 1.25,
                letterSpacing: "-0.02em",
                display: "flex",
              }}
            >
              {title}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 24,
              opacity: 0.8,
              borderTop: `1px solid ${isLight ? "#e2e8f0" : "rgba(255,255,255,0.12)"}`,
              paddingTop: 26,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  background: theme.accent,
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                {author.slice(0, 1)}
              </div>
              <div style={{ display: "flex" }}>{author}</div>
            </div>
            <div style={{ display: "flex", opacity: 0.6 }}>{siteConfig.url.replace(/^https?:\/\//, "")}</div>
          </div>
        </div>
      ),
      {
        ...size,
        headers: {
          // 内容指纹变化时 v 参数变化 → 自动取新图
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      }
    );
  } catch {
    // 降级：返回一张纯色占位图，保证分享链路不中断
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f172a",
            color: "#f8fafc",
            fontSize: 64,
            fontWeight: 700,
          }}
        >
          {siteConfig.title}
        </div>
      ),
      size
    );
  }
}

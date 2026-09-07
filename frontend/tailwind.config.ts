import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--bg-rgb) / <alpha-value>)",
        surface: "rgb(var(--surface-rgb) / <alpha-value>)",
        foreground: "rgb(var(--fg-rgb) / <alpha-value>)",
        muted: "rgb(var(--fg-muted-rgb) / <alpha-value>)",
        border: "rgb(var(--border-rgb) / <alpha-value>)",
        "border-strong": "rgb(var(--border-strong-rgb) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--accent-rgb) / <alpha-value>)",
          soft: "var(--accent-soft)",
        },
        code: "rgb(var(--code-bg-rgb) / <alpha-value>)",
        "on-accent": "var(--on-accent)",
        card: "rgb(var(--card-rgb) / <alpha-value>)",
        success: "rgb(var(--success-rgb) / <alpha-value>)",
        warning: "rgb(var(--warning-rgb) / <alpha-value>)",
        error: "rgb(var(--error-rgb) / <alpha-value>)",
        info: "rgb(var(--info-rgb) / <alpha-value>)",
      },
      fontSize: {
        /* 统一的排版尺度：正文 / 次要信息 / 导语 */
        body: ["0.9375rem", { lineHeight: "1.7" }],
        meta: ["0.8125rem", { lineHeight: "1.5" }],
        lead: ["1.0625rem", { lineHeight: "1.7" }],
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "PingFang SC",
          "Microsoft YaHei",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "JetBrains Mono",
          "SFMono-Regular",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        /* 原型刻度：输入框与小控件 8 / 面板 10 / 弹窗 14 */
        btn: "8px",
        panel: "10px",
        modal: "14px",
      },
      boxShadow: {
        panel: "0 1px 2px rgb(15 23 42 / 0.04)",
        raised: "0 10px 30px -12px rgb(15 23 42 / 0.18)",
      },
      maxWidth: {
        content: "720px",
        container: "1200px",
      },
      typography: {
        DEFAULT: {
          css: {
            "--tw-prose-body": "var(--fg)",
            "--tw-prose-headings": "var(--fg)",
            "--tw-prose-links": "var(--accent)",
            "--tw-prose-bold": "var(--fg)",
            "--tw-prose-quotes": "var(--fg-muted)",
            "--tw-prose-quote-borders": "var(--border)",
            "--tw-prose-code": "var(--fg)",
            "--tw-prose-hr": "var(--border)",
            "--tw-prose-counters": "var(--fg-muted)",
            "--tw-prose-bullets": "var(--border)",
            maxWidth: "100%",
          },
        },
      },
      keyframes: {
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.4s ease-out both",
        blink: "blink 1s steps(1) infinite",
      },
    },
  },
  plugins: [typography],
};

export default config;

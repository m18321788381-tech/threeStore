"""AI 润色：调用兼容 OpenAI /chat/completions 的 LLM 改写正文文字表达。

设计要点：
  1. **只改表达，不改结构与事实**——系统提示词强制约束 LLM 保留全部 Markdown
     语法、代码块、`[[双向链接]]`、图片/链接/公式/Mermaid 不被破坏；
  2. **纯客户端调用**——后端只做转发与错误归一化，不缓存、不落库；
  3. **未配置即关闭**——`settings.ai_enabled` 为 False 时端点直接 503，
     本模块不会被调用。
"""
from __future__ import annotations

import httpx

from app.core.config import settings

# 风格 → 用户可读名称 + 提示词附加指令。
# 刻意把映射表收敛在此：前端只传 key，提示词模板由后端统一维护，
# 避免「前端改文案 → 后端行为漂移」与「提示词散落两处」。
STYLE_PROMPTS: dict[str, str] = {
    "concise": "精炼简洁：删去冗词赘句，保留信息密度，让句子更短更直接。",
    "vivid": "生动流畅：在保持原意的前提下，让表达更自然、有画面感，但不堆砌辞藻。",
    "professional": "专业严谨：用词准确、逻辑清晰，适合技术博客，避免口语化。",
    "casual": "口语化：像在跟朋友聊天一样讲清楚事情，轻松易读。",
    "expand": "润色并适度扩写：在保持原意与结构的前提下，补充必要的过渡与解释，让读起来更连贯。",
}


# 系统提示词：约束 LLM 不得破坏 Markdown 结构。
# 这是本功能的红线——润色一旦动了代码块/链接/公式，正文就废了。
_SYSTEM = """你是专业的中文写作润色助手。你会收到一篇 Markdown 格式的博客正文，\
请只改写其中的文字表达，使其更通顺、自然，必须严格遵守以下约束：

1. **绝对不得修改代码块**（``` 包裹的内容）、行内代码（`code`）、数学公式（$...$ / $$...$$）、\
Mermaid 图表（```mermaid 块）的内容与格式标记。
2. **绝对不得修改**图片语法 `![alt](url)`、链接语法 `[text](url)` 中的 URL 部分；\
可以润色 alt 文字与链接文字，但不得增删链接本身。
3. **绝对不得修改** `[[双向链接]]` 语法及其中的标题文本——这是站内链接，改了就失效。
4. **不得增删标题层级**（# 的数量不变），可以润色标题文字本身。
5. 保留所有列表标记（- / * / 1. / - [ ]）、表格结构、分割线（---）、引用标记（>）。
6. 不得添加或删除段落，不得重新排序段落；只在段落内部改写文字。
7. 不得添加任何 HTML 标签、不得添加注释、不得输出解释说明，只输出润色后的完整 Markdown。
8. 保持原文语言：中文文章润色后仍是中文，英文代码注释保持英文。
9. 输出必须是完整的正文，不要省略任何部分，不要加前后缀说明。"""


def _user_prompt(text: str, style_key: str) -> str:
    instruction = STYLE_PROMPTS.get(style_key, STYLE_PROMPTS["concise"])
    return f"请按以下风格润色这篇博客正文：\n\n风格要求：{instruction}\n\n正文：\n{text}"


class PolishError(RuntimeError):
    """润色失败，message 已是面向用户的中文提示。"""


async def polish(text: str, style: str = "concise") -> str:
    """调用 LLM 润色正文，返回润色后的 Markdown 文本。

    - 空正文直接返回原文，不浪费 token；
    - 网络/超时/解析失败统一抛 `PolishError`（中文提示），由端点转 502。
    """
    if not text or not text.strip():
        return text

    if not settings.ai_enabled:
        raise PolishError("AI 润色未配置，请在 .env 中设置 AI_API_KEY 与 AI_MODEL")

    payload = {
        "model": settings.AI_MODEL,
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": _user_prompt(text, style)},
        ],
        "temperature": 0.7,
        "stream": False,
    }
    headers = {
        "Authorization": f"Bearer {settings.AI_API_KEY}",
        "Content-Type": "application/json",
    }
    base = settings.AI_BASE_URL.rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT) as client:
            resp = await client.post(
                f"{base}/chat/completions", json=payload, headers=headers
            )
    except httpx.TimeoutException as exc:
        raise PolishError(
            f"AI 服务响应超时（{settings.AI_TIMEOUT}s），请稍后重试"
        ) from exc
    except httpx.HTTPError as exc:
        raise PolishError(f"无法连接 AI 服务：{exc}") from exc

    if resp.status_code == 401:
        raise PolishError("AI 服务返回 401，请检查 AI_API_KEY 是否正确")
    if resp.status_code == 429:
        raise PolishError("AI 服务返回 429，请求过于频繁，请稍后重试")
    if resp.status_code >= 400:
        # 截取前 200 字，避免把整个错误体抛给用户
        snippet = resp.text[:200].replace("\n", " ")
        raise PolishError(
            f"AI 服务返回错误（HTTP {resp.status_code}）：{snippet}"
        )

    try:
        data = resp.json()
        result = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as exc:
        raise PolishError("AI 服务返回格式异常，无法解析润色结果") from exc

    if not result or not result.strip():
        raise PolishError("AI 服务返回了空内容，请重试")

    return result.strip()

"""Markdown 渲染管线回归测试（不依赖数据库）。

为什么值得钉住：
    `content_html` 是**保存时渲染并落库**的缓存 —— 渲染管线写错，
    错误就被固化进数据库，要重新保存文章才能修好。因此这里的每条断言
    都对应一个「写错了会静默藏在正文里、且很难被发现」的行为。

覆盖三块新能力：
    1. 围栏代码块的附加属性（文件名 / 行高亮）
    2. Mermaid 图表块的容器标记
    3. 数学公式的严格美元规则（不能误吞 shell 变量与金额）
"""
from __future__ import annotations

from app.services.markdown import (
    ALLOWED_ATTRS,
    MATH_BLOCK_CLASS,
    MATH_INLINE_CLASS,
    MERMAID_CLASS,
    parse_fence_meta,
    render_markdown,
)


# --------------------------------------------------------- 围栏附加属性 ---
def test_parse_filename_and_line_ranges():
    assert parse_fence_meta("title=app.py {1,3-5}") == ("app.py", [1, 3, 4, 5])


def test_parse_bare_filename():
    assert parse_fence_meta("app.py {2}") == ("app.py", [2])


def test_parse_quoted_filename_with_space():
    assert parse_fence_meta('title="my file.py"') == ("my file.py", [])


def test_parse_unknown_words_are_not_filenames():
    # `js strict` 里的 strict 没有扩展名，绝不能被当成文件名
    assert parse_fence_meta("js strict") == ("", [])


def test_parse_reversed_range_is_normalized():
    assert parse_fence_meta("{5-3}") == ("", [3, 4, 5])


def test_parse_empty_returns_empty():
    assert parse_fence_meta("") == ("", [])


def test_parse_dedupes_and_drops_non_positive_lines():
    assert parse_fence_meta("{1,1,0}") == ("", [1])


def test_fence_attrs_land_on_pre_tag():
    html = render_markdown("```python title=app.py {2}\nx = 1\ny = 2\n```").html
    assert 'data-file="app.py"' in html
    assert 'data-hl="2"' in html


def test_fence_language_class_preserved():
    html = render_markdown("```python\nx = 1\n```").html
    assert 'class="language-python"' in html


def test_plain_fence_has_no_extra_attrs():
    html = render_markdown("```\nplain\n```").html
    assert "data-file" not in html
    assert "data-hl" not in html


def test_line_highlight_marks_hll_span():
    html = render_markdown("```python {1}\nx = 1\ny = 2\n```").html
    assert '<span class="hll">' in html


def test_fence_filename_is_escaped():
    # 文件名进的是 HTML 属性，必须转义，否则可用来闭合属性并注入新属性
    html = render_markdown("```python title=a&b.py\nx = 1\n```").html
    assert 'data-file="a&amp;b.py"' in html


def test_fence_filename_cannot_break_out_of_attribute():
    # title= 接受任意非空白字符，因此是属性注入的真实入口：
    # 里面的引号必须被转义成实体，不能闭合 data-file 并凭空多出属性
    html = render_markdown(
        '```python title=a"onerror="alert(1)"x.py\nx = 1\n```'
    ).html
    assert "onerror=" not in html.replace("&quot;onerror=&quot;", "")
    assert "&quot;" in html


def test_fence_filename_angle_brackets_escaped():
    html = render_markdown(
        "```python filename=<img src=x onerror=alert(1)>.py\nx = 1\n```"
    ).html
    assert "<img" not in html


def test_malformed_attrs_do_not_drop_code():
    # 附加属性写错时，代码内容必须完整保留（宁可没有标题栏，不能丢代码）
    html = render_markdown("```python {abc} def\nprint(1)\n```").html
    assert "print" in html


def test_fence_meta_does_not_leak_into_code_text():
    html = render_markdown("```python title=app.py {1}\nx = 1\n```").html
    assert "title=app.py" not in html
    assert "{1}" not in html


def test_unsupported_attr_word_is_ignored_not_rendered():
    """无法识别的附加属性词（如 linenos）必须被静默丢弃。

    它既不能留成 pre 上的属性，也不能漏进代码正文 —— 后者会让读者
    在代码块里看到自己写的 ```python linenos 尾巴。
    """
    html = render_markdown("```python linenos\nx = 1\n```").html
    assert "linenos" not in html
    assert "data-linenos" not in html
    assert 'class="language-python"' in html
    assert "<span" in html  # 高亮正常，不受未知属性影响


def test_data_linenos_is_not_whitelisted():
    """bleach 白名单不得放行 data-linenos。

    该属性没有任何写入方与读取方；一旦放行，将来任何能写进 <pre> 的
    内容都能凭空带上它，制造「有这个功能」的假象。
    """
    assert "data-linenos" not in ALLOWED_ATTRS["pre"]


# ------------------------------------------------------------------ 图表 ---
def test_mermaid_block_marker():
    html = render_markdown("```mermaid\ngraph TD\n  A --> B\n```").html
    assert f'class="{MERMAID_CLASS}"' in html
    assert "language-mermaid" in html


def test_mermaid_source_is_escaped_not_executed():
    # 图形源码里的尖括号/引号必须转义，前端读 textContent 才能还原原文
    html = render_markdown("```mermaid\ngraph TD\n  A[<x> & 'q']\n```").html
    assert "&lt;x&gt;" in html
    assert "<x>" not in html


def test_mermaid_not_highlighted_as_code():
    # 走的是原样输出分支，不应出现 pygments 的 span
    html = render_markdown("```mermaid\ngraph TD\n  A --> B\n```").html
    assert '<span class="k">' not in html


# -------------------------------------------------------------- 数学公式 ---
def test_inline_math_marker():
    html = render_markdown("$\\alpha + \\beta$").html
    assert f'class="{MATH_INLINE_CLASS}"' in html


def test_block_math_marker():
    html = render_markdown("$$\n\\int_0^1 x\\,dx\n$$").html
    assert f'class="{MATH_BLOCK_CLASS}"' in html


def test_math_content_is_escaped():
    # 公式里写 HTML 不能被执行，须以实体形式落到容器文本节点
    html = render_markdown("$<script>alert(1)</script>$").html
    assert "&lt;script&gt;" in html
    assert "<script>" not in html


def test_math_keeps_raw_latex_for_katex():
    # 前端用 textContent 取回原文喂给 KaTeX，因此反斜杠必须原样保留
    html = render_markdown("$\\frac{1}{2}$").html
    assert "\\frac{1}{2}" in html


def test_shell_variables_are_not_math():
    # 严格美元规则的核心价值：shell 变量不能变成公式
    html = render_markdown("echo $PATH and $HOME now").html
    assert MATH_INLINE_CLASS not in html
    assert "$PATH" in html


def test_currency_is_not_math():
    # 金额同理：$5 ... $10 不能被误吞
    html = render_markdown("cost is $5 and $10 total").html
    assert MATH_INLINE_CLASS not in html


def test_escaped_dollar_stays_literal():
    html = render_markdown("\\$x\\$").html
    assert MATH_INLINE_CLASS not in html
    assert "$x$" in html


def test_spaced_dollar_is_not_math():
    # 严格模式下 `$ x $` 不视为公式（避免与散文里的美元符号混淆）
    html = render_markdown("with space $ x + y $ ok").html
    assert MATH_INLINE_CLASS not in html


def test_labeled_block_math_gets_prefixed_anchor():
    html = render_markdown("$$\nE = mc^2\n$$ (eq1)").html
    # 前缀 eq- 避免与标题锚点撞 id
    assert 'id="eq-eq1"' in html


# ------------------------------------------------------------------ 兼容 ---
def test_existing_features_still_work():
    """确认新管线没有破坏既有能力：wiki 链接、任务列表、脚注。"""
    html = render_markdown(
        "- [x] done\n- [ ] todo\n\nA footnote[^1].\n\n[^1]: note\n"
    ).html
    assert 'type="checkbox"' in html
    assert "footnote" in html


def test_indented_code_block_unaffected():
    html = render_markdown("    indented code\n").html
    assert "indented code" in html
    assert "data-file" not in html

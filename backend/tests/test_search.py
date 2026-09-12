"""搜索分词与高亮的回归测试。

这些用例不依赖数据库，只覆盖 app.services.search：
中文分词是全文检索里最容易悄悄失效的一环（改一次正则就可能让整句匹配退化），
必须钉住。查询构造本身的正确性由 postgres 方言渲染保证，见 CI 的导入冒烟。
"""
from __future__ import annotations


import pytest

from app.services.search import build_snippet, highlight, strip_markdown, tokenize


def test_latin_and_cjk_mixed():
    assert tokenize("docker 部署") == ["docker", "部署"]


def test_cjk_phrase_kept_as_whole():
    # 整句必须整体保留：否则「容器化部署」会被拆得无法精确命中
    terms = tokenize("容器化部署实战")
    assert terms[0] == "容器化部署实战"
    assert "容器" in terms and "部署" in terms


def test_expand_false_only_primary():
    assert tokenize("容器化部署实战", expand=False) == ["容器化部署实战"]


def test_empty_and_blank():
    assert tokenize("") == []
    assert tokenize("   ") == []


def test_noise_words_removed_when_possible():
    # 「的」几乎每篇都出现，不该成为一个召回词元；
    # 但当它出现在多字词内部（如「的部署」）时必须保留，不能整词丢掉
    assert tokenize("Docker 的") == ["Docker"]
    assert "的部署" in tokenize("的部署")


def test_strip_markdown_removes_syntax():
    md = "# 标题\n\n```bash\ndocker run\n```\n\n正文里有 `code` 和 [链接](http://x)。"
    text = strip_markdown(md)
    assert "```" not in text
    assert "docker run" not in text
    assert "#" not in text
    assert "链接" in text


def test_highlight_escapes_injection():
    out = highlight("输入 <script>alert(1)</script> 试试", ["script"])
    # 只允许出现 <mark>，其余尖括号必须被转义（转义文本会被 <mark> 切断，故分开断言）
    assert '<mark class="kw">script</mark>' in out
    assert "<script>" not in out
    assert "&lt;" in out and "&gt;" in out
    assert out.replace('<mark class="kw">', "").replace("</mark>", "").count("<") == 0


def test_highlight_case_insensitive():
    assert '<mark class="kw">Docker</mark>' in highlight("docker 与 Docker", ["docker"])


def test_build_snippet_centers_on_hit():
    content = "前面" + "填充" * 200 + "这里是部署要点" + "后面" * 200
    snippet = build_snippet(content, ["部署"])
    assert "部署" in snippet
    assert "<mark" in snippet
    assert snippet.startswith("…")  # 命中点前有截断
    assert len(snippet) < len(content)


def test_build_snippet_falls_back_to_head():
    snippet = build_snippet("完全不相关的正文内容", ["部署"], summary="摘要里也没有")
    assert "<mark" not in snippet
    assert snippet.startswith("摘要里也没有")


@pytest.mark.parametrize("keyword", ["", "  ", "!!!", "A"])
def test_tokenize_never_crashes(keyword):
    assert isinstance(tokenize(keyword), list)

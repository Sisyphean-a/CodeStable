// 受限 Markdown 渲染：唯一生产依赖 markdown-it，关闭原始 HTML、
// 自动 linkify 与图片渲染；链接按解析状态应用安全规则。

import MarkdownIt from "markdown-it";

import { escapeHtml } from "../web/views/shared.js";

// linkMap: Map<href原文, { resolution, targetId?, originalTarget? }>，
// 由实体详情投影根据索引关系构建。
export function createMarkdownRenderer(linkMap = new Map()) {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: false,
    breaks: false,
  });

  // 图片禁用：只保留占位文本，不输出 <img>。
  md.renderer.rules.image = (tokens, idx) =>
    `<span class="img-disabled">[图片已禁用${tokens[idx].altText ? `：${escapeHtml(tokens[idx].altText)}` : ""}]</span>`;

  // 标题锚点：与索引标题目录一致，供页面内跳转。
  const defaultHeadingOpen = md.renderer.rules.heading_open;
  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const anchor = env?.headingAnchors?.[env._headingIndex]?.anchor;
    if (anchor) token.attrSet("id", anchor);
    env._headingIndex = (env._headingIndex ?? 0) + 1;
    return defaultHeadingOpen
      ? defaultHeadingOpen(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };

  // 链接安全规则。
  const defaultLinkOpen = md.renderer.rules.link_open;
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet("href") ?? "";
    const link = linkMap.get(href) ?? classifyHref(href);
    if (link.resolution === "resolved" && link.targetId) {
      token.attrSet("href", `?view=reader&entity=${encodeURIComponent(link.targetId)}`);
      token.attrSet("data-entity", link.targetId);
      token.attrSet("class", "internal-link");
    } else if (link.resolution === "external") {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
      token.attrSet("class", "external-link");
    } else {
      // unresolved / unsafe：不可点击，保留原始目标文本与状态。
      token.attrSet("href", "#");
      token.attrSet("class", `unresolved-link link-${link.resolution ?? "unresolved"}`);
      token.attrSet("aria-disabled", "true");
      token.attrSet("data-original-target", href);
      if (link.resolution === "unsafe") token.attrSet("data-unsafe", "1");
    }
    return defaultLinkOpen ? defaultLinkOpen(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
  };

  return {
    render(markdown, env = {}) {
      env._headingIndex = 0;
      return md.render(markdown ?? "", env);
    },
  };
}

// 未进入正式关系的 href 的安全分类（防注入第一道防线）。
function classifyHref(href) {
  if (/^(https?:|mailto:|ftp:)/i.test(href)) return { resolution: "external" };
  return { resolution: "unresolved" };
}

export { escapeHtml };

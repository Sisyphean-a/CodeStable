// 阅读视图：深链接实体正文（服务端受限渲染）。
// 阅读页只保留返回、路径、标题与 Markdown 原文，不生成代码入口或关系面板。

import { escapeHtml, sectionTitle, skeleton } from "./shared.js";

export function renderReader(snapshot, urlState, detail = null, loadError = null) {
  const target = urlState.entity ?? "";
  if (!target) {
    return readerState("阅读", "没有指定实体。", "返回概览");
  }
  if (!/^[A-Za-z][A-Za-z0-9]*:/.test(target)) {
    return readerState("对象不可用", "目标不是稳定的实体 ID。", "返回概览", target);
  }
  if (
    loadError === "not-found" ||
    (detail === null && loadError === null && !isKnown(snapshot, target))
  ) {
    return readerState(
      "对象不可用",
      "当前快照中不存在该实体：可能已被删除、重命名或尚未建立。",
      "返回概览",
      target,
    );
  }
  if (loadError === "load-failed") {
    return readerState(
      "读取失败",
      "实体详情请求失败。",
      "返回概览",
      target,
    );
  }
  if (detail === null) {
    return `<section class="reader-state">
      ${sectionTitle("阅读")}
      <p class="reader-target">${escapeHtml(target)}</p>
      <p class="empty">正在加载正文…</p>
      ${skeleton(6)}
      <a class="back-link" href="?view=overview">返回概览</a>
    </section>`;
  }
  return detailView(detail);
}

function isKnown(snapshot, target) {
  return snapshot.entities.some((entity) => entity.id === target);
}

function readerState(title, message, backLabel, target = "") {
  return `<section class="reader-state">
    ${sectionTitle(title)}
    ${target ? `<p class="reader-target">${escapeHtml(target)}</p>` : ""}
    <p class="empty">${escapeHtml(message)}</p>
    <a class="back-link" href="?view=overview">${escapeHtml(backLabel)}</a>
  </section>`;
}

function detailView(detail) {
  const title = detail.title ?? detail.id;
  const sourcePath = detail.source?.path ?? "";
  const content = detail.hasMarkdown
    ? detail.contentHtml
    : `<p class="empty">该实体没有可读 Markdown 正文（${escapeHtml(detail.kind)}）。</p>`;

  return `<section class="reader-page">
    <header class="reader-head">
      <a class="back-link" href="?view=overview">返回概览</a>
      <h1>${escapeHtml(title)}</h1>
      ${sourcePath ? `<p class="reader-meta meta">${escapeHtml(sourcePath)}</p>` : ""}
    </header>
    <article class="reader-content" id="reader-content">${content}</article>
  </section>`;
}

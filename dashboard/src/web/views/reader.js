// 阅读页：原文是唯一内容中心；面板只补充来源、读取状态和明确关系。
// 不生成摘要、推荐路线或任务控制。

import { entityLink, escapeHtml, pill, skeleton } from "./shared.js";

const BACK_HREF = "?view=documents";
const BACK_LABEL = "返回概览";

export function renderReader(snapshot, urlState = {}, detail = null, loadError = null) {
  const target = urlState.entity ?? "";
  if (!target) return readerState("阅读", "没有指定实体。", BACK_LABEL);
  if (!/^[A-Za-z][A-Za-z0-9]*:/.test(target)) {
    return readerState("对象不可用", "目标不是稳定的实体 ID。", BACK_LABEL, target);
  }
  if (
    loadError === "not-found" ||
    (detail === null && loadError === null && !isKnown(snapshot, target))
  ) {
    return readerState(
      "对象不可用",
      "当前快照中不存在该实体：可能已被删除、重命名或尚未建立。",
      BACK_LABEL,
      target,
    );
  }
  if (loadError === "load-failed") {
    return readerState("读取失败", "资料详情请求失败。", BACK_LABEL, target);
  }
  if (detail === null) {
    return `<section class="reader-state">
      <p class="eyebrow">DOCUMENT / LOADING</p>
      <p class="reader-target">${escapeHtml(target)}</p>
      <p class="empty">正在加载正文…</p>
      ${skeleton(6)}
      <a class="back-link" href="${BACK_HREF}">${BACK_LABEL}</a>
    </section>`;
  }
  return detailView(snapshot, detail);
}

function isKnown(snapshot, target) {
  return (snapshot.entities ?? []).some((entity) => entity.id === target) ||
    (snapshot.documents ?? []).some((document) => document.id === target);
}

function readerState(title, message, backLabel, target = "") {
  return `<section class="reader-state">
    <p class="eyebrow">DOCUMENT / STATUS</p>
    <h1>${escapeHtml(title)}</h1>
    ${target ? `<p class="reader-target">${escapeHtml(target)}</p>` : ""}
    <p class="empty">${escapeHtml(message)}</p>
    <a class="back-link" href="${BACK_HREF}">${escapeHtml(backLabel)}</a>
  </section>`;
}

function detailView(snapshot, detail) {
  const title = detail.title ?? detail.id;
  const sourcePath = detail.source?.path ?? "";
  const unavailable = detail.status === "unavailable" || detail.source?.validity === "unavailable";
  const stale = snapshot?.snapshot?.status === "stale";
  const content = unavailable
    ? `<div class="reader-message reader-message-error">
        <strong>这份资料当前不可读取。</strong>
        <p>${escapeHtml(detail.diagnostics?.[0]?.message ?? "读取失败，保留真实错误以便定位。")}</p>
      </div>`
    : detail.hasMarkdown
      ? detail.contentHtml ?? ""
      : `<p class="empty">该对象没有可读 Markdown 正文（${escapeHtml(detail.kind)}）。</p>`;

  return `<section class="reader-page">
    <header class="reader-head">
      <div class="reader-head-top">
        <a class="back-link" href="${BACK_HREF}">${BACK_LABEL}</a>
        <span class="reader-kind">${escapeHtml(detail.kind ?? "Document")}</span>
      </div>
      <h1>${escapeHtml(title)}</h1>
      ${sourcePath ? `<p class="reader-meta meta">${escapeHtml(sourcePath)}</p>` : ""}
      <div class="reader-statuses">
        ${unavailable ? pill("读取失败", "danger") : ""}
        ${stale ? pill("索引 stale", "warn") : ""}
        ${detail.validity && detail.validity !== "valid" && !unavailable ? pill("资料不完整", "warn") : ""}
        ${detail.source?.modifiedAt ? `<span class="meta">更新于 ${escapeHtml(formatDate(detail.source.modifiedAt))}</span>` : ""}
      </div>
    </header>

    <article class="reader-content" id="reader-content">${content}</article>
    ${renderRelations(detail)}
    ${renderDiagnostics(detail)}
  </section>`;
}

function renderRelations(detail) {
  const outgoing = detail.relations?.outgoing ?? [];
  const incoming = detail.relations?.incoming ?? [];
  const resolved = [...outgoing, ...incoming]
    .filter((relation) => relation.to && relation.targetTitle && relation.to !== detail.id)
    .map((relation) => ({ ...relation, direction: relation.direction }));
  const unique = new Map();
  for (const relation of resolved) {
    const key = `${relation.direction}:${relation.to}:${relation.kind}`;
    if (!unique.has(key)) unique.set(key, relation);
  }
  const links = [...unique.values()];
  const unresolved = [...outgoing, ...incoming].filter(
    (relation) => !relation.to || !relation.targetTitle,
  );
  if (links.length === 0 && unresolved.length === 0) return "";

  return `<section class="reader-relations" aria-label="明确关系">
    <header class="reader-subhead"><h2>继续阅读</h2><span class="sub">来自文档链接和已声明关系</span></header>
    ${links.length ? `<ul class="related-list">${links.map((relation) => {
      const direction = relation.direction === "incoming" ? "引用此文档" : relation.kind === "links-to" ? "链接到" : relation.kind;
      return `<li><span class="relation-kind">${escapeHtml(direction)}</span>${entityLink(relation.to, relation.targetTitle)}${relation.provenance?.text ? `<span class="sub">${escapeHtml(relation.provenance.text)}</span>` : ""}</li>`;
    }).join("")}</ul>` : ""}
    ${unresolved.length ? `<p class="reader-unresolved">${unresolved.length} 条关系无法导航：${unresolved.map((relation) => escapeHtml(relation.originalTarget ?? relation.provenance?.text ?? "未解析目标")).join("、")}</p>` : ""}
  </section>`;
}

function renderDiagnostics(detail) {
  const diagnostics = detail.diagnostics ?? [];
  if (diagnostics.length === 0) return "";
  return `<section class="reader-diagnostics" aria-label="资料诊断">
    <h2>读取状态</h2>
    <ul>${diagnostics.slice(0, 8).map((diagnostic) => `<li><span class="diag-code">${escapeHtml(diagnostic.code ?? diagnostic.severity ?? "diagnostic")}</span>${escapeHtml(diagnostic.message ?? "未知诊断")}</li>`).join("")}</ul>
  </section>`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("zh-CN");
}

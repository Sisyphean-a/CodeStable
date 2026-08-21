// 概览视图：只提供架构索引语境与真实文档入口，不展开统计、近期变化或解释性导读。

import { entityLink, escapeHtml, unconfigured } from "./shared.js";

const CURRENT_STATE_KINDS = new Set([
  "AttentionDocument",
  "ArchitectureIndex",
  "ArchitectureDocument",
  "RequirementIndex",
  "RequirementDocument",
  "ADR",
]);

export function renderOverview(snapshot) {
  const entities = snapshot.entities ?? [];
  const architectureIndex = entities.find(
    (entity) => entity.kind === "ArchitectureIndex",
  );
  const packageDocuments = sortDocuments(
    entities.filter(
      (entity) =>
        entity.kind === "ArchitectureDocument" &&
        entity.path?.startsWith(".codestable/architecture/packages/"),
    ),
  );
  const currentStateDocuments = sortDocuments(
    entities.filter(
      (entity) =>
        CURRENT_STATE_KINDS.has(entity.kind) &&
        entity.kind !== "ArchitectureIndex" &&
        !entity.path?.startsWith(".codestable/architecture/packages/"),
    ),
  );
  const readme = entities.find(
    (entity) => entity.kind === "ReaderDocument" && entity.path === "README.md",
  );

  return `<section class="overview-landing">
    <header class="overview-header">
      <p class="overview-kicker">${escapeHtml(architectureIndex?.title ?? "架构索引")}</p>
      <h1>${escapeHtml(architectureIndex?.title ?? "架构索引")}</h1>
    </header>

    <div class="overview-entries">
      ${renderEntitySection("项目", architectureIndex ? [architectureIndex] : [])}
      ${renderEntitySection("包与能力", packageDocuments)}
      ${renderEntitySection("当前态", currentStateDocuments)}
      ${renderHistorySection(snapshot)}
      ${renderDocumentsSection(readme)}
    </div>
  </section>`;
}

function sortDocuments(items) {
  return [...items].sort((left, right) =>
    String(left.path ?? left.title).localeCompare(
      String(right.path ?? right.title),
    ),
  );
}

function renderEntitySection(title, items) {
  return `<section class="overview-entry-section">
    <h2>${escapeHtml(title)}</h2>
    ${items.length === 0
      ? unconfigured(title)
      : `<ul class="overview-entry-list">${items.map(renderEntityEntry).join("")}</ul>`}
  </section>`;
}

function renderEntityEntry(entity) {
  return `<li class="overview-entry">
    ${entityLink(entity.id, entity.scope?.startsWith("package:") ? entity.scope : entity.title)}
    ${entity.path ? `<span class="meta">${escapeHtml(entity.path)}</span>` : ""}
  </li>`;
}

function renderHistorySection(snapshot) {
  if (!snapshot.overview.hasHistory) {
    return `<section class="overview-entry-section">
      <h2>变化</h2>
      ${unconfigured("项目历史")}
    </section>`;
  }
  return `<section class="overview-entry-section">
    <h2>变化</h2>
    <ul class="overview-entry-list">
      <li class="overview-entry">
        <a class="entity-link" href="?view=history">历史时间线</a>
        <span class="meta">.codestable/history/</span>
      </li>
    </ul>
  </section>`;
}

function renderDocumentsSection(readme) {
  const items = [
    ...(readme ? [renderEntityEntry(readme)] : []),
    `<li class="overview-entry"><a class="entity-link" href="?view=documents">全部文档</a></li>`,
  ];
  return `<section class="overview-entry-section">
    <h2>文档</h2>
    <ul class="overview-entry-list">${items.join("")}</ul>
  </section>`;
}

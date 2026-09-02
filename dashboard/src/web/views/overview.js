// 首页：文档入口，不做项目导读、评分或推荐。
// 全部入口来自 ProjectIndex 的 documents 投影；正文阅读由 reader 视图承接。

import {
  entityLink,
  escapeHtml,
  pill,
  unconfigured,
} from "./shared.js";

const GROUPS = [
  {
    key: "当前态",
    title: "当前态",
    sub: "注意力规则、架构、领域与已确认决定",
  },
  {
    key: "包与能力",
    title: "包与能力",
    sub: "按包定位职责、边界和代码锚点",
  },
  {
    key: "工作状态资料",
    title: "工作状态资料",
    sub: "仍可阅读的探路、规格与工单资料",
  },
  {
    key: "历史",
    title: "历史",
    sub: "按月份保留的演变记录",
  },
  {
    key: "读者与技能资料",
    title: "读者与技能资料",
    sub: "README 与可读技能入口",
  },
];

export function renderOverview(snapshot) {
  const documents = documentList(snapshot);
  const projectName = snapshot.project?.name ?? snapshot.overview?.identity?.name ?? "CodeStable";
  const available = documents.filter((document) => document.validity === "valid").length;
  const groups = GROUPS.map((group) => ({
    ...group,
    documents: documents.filter((document) => document.group === group.key),
  }));

  return `<section class="library-home overview-landing">
    <header class="library-header">
      <p class="eyebrow">CODESTABLE / DOCUMENTS</p>
      <div class="library-heading-row">
        <div>
          <h1>${escapeHtml(projectName)}</h1>
          <p class="library-lede">只读项目资料。选择一份文档开始阅读。</p>
        </div>
        <div class="library-actions">
          <a class="button button-dark" href="?view=map">节点地图</a>
          <a class="button button-quiet" href="?view=documents">全部文档</a>
        </div>
      </div>
      <p class="library-count">${documents.length} 份可读资料 · ${available} 份可正常读取</p>
    </header>

    <form id="search-form" class="home-search search-form" data-target-view="documents" role="search">
      <label class="sr-only" for="search-input">搜索项目资料</label>
      <span class="search-mark" aria-hidden="true">⌕</span>
      <input id="search-input" name="q" type="search" placeholder="搜索标题、路径、术语或正文…">
      <button type="submit">搜索资料</button>
    </form>

    <div class="library-sections">
      ${groups.map((group) => renderGroup(group)).join("")}
    </div>
  </section>`;
}

function documentList(snapshot) {
  if (Array.isArray(snapshot.documents)) return snapshot.documents;
  const documentKinds = new Set([
    "AttentionDocument",
    "ArchitectureIndex",
    "ArchitectureDocument",
    "RequirementIndex",
    "RequirementDocument",
    "ADR",
    "HistoryDocument",
    "DecisionMap",
    "Decision",
    "Specification",
    "Ticket",
    "ReaderDocument",
    "Skill",
  ]);
  return (snapshot.entities ?? [])
    .filter((entity) => documentKinds.has(entity.kind) && entity.path)
    .map((entity) => ({
      ...entity,
      group: entity.path.startsWith(".codestable/architecture/packages/")
        ? "包与能力"
        : entity.kind === "HistoryDocument"
          ? "历史"
          : entity.authority === "work-state"
            ? "工作状态资料"
            : entity.authority === "current-state"
              ? "当前态"
              : "读者与技能资料",
    }));
}

function renderGroup(group) {
  const items = [...group.documents].sort((left, right) =>
    String(left.path ?? left.title).localeCompare(String(right.path ?? right.title)),
  );
  const body = items.length > 0
    ? `<ul class="document-list">${items.map(renderDocument).join("")}</ul>`
    : group.key === "历史"
      ? unconfigured("项目历史")
      : '<p class="empty">暂无纳入的资料</p>';
  return `<section class="library-section" data-document-group="${escapeHtml(group.key)}">
    <div class="library-section-head">
      <div>
        <h2>${escapeHtml(group.title)}</h2>
        <p>${escapeHtml(group.sub)}</p>
      </div>
      <span class="section-count">${items.length}</span>
    </div>
    ${body}
    ${group.key === "历史" && items.length > 0
      ? '<p class="section-action"><a href="?view=history">历史时间线</a></p>'
      : ""}
  </section>`;
}

function renderDocument(document) {
  const link = document.id
    ? entityLink(document.id, document.group === "包与能力" && document.scope?.startsWith("package:")
      ? document.scope
      : document.title ?? document.path)
    : `<span class="document-title">${escapeHtml(document.title ?? document.path)}</span>`;
  const status = document.validity === "valid"
    ? ""
    : pill(document.validity === "unavailable" ? "读取失败" : "资料不完整", "danger");
  const detail = [document.path, document.scope].filter(Boolean).join(" · ");
  return `<li class="document-row">
    <div class="document-row-main">${link}${status}</div>
    <span class="document-path meta">${escapeHtml(detail)}</span>
  </li>`;
}

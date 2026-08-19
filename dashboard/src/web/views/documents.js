// 文档视图：权威优先目录 + 跨实体结构化搜索。
// 目录按资料角色与权威层级分组；搜索只匹配已确认字段；
// 无结果时显示查询、筛选、可搜索字段、清除筛选与目录返回入口；
// 未索引 Markdown 仅在显式切换范围时列出。

import {
  entityLink,
  escapeHtml,
  pageFrame,
  pill,
  sectionTitle,
  sideNav,
  skeleton,
} from "./shared.js";

const CATEGORY_LABELS = {
  "current-state": "当前态",
  "work-state": "工作状态",
  history: "历史",
  "reader-document": "读者文档",
  skill: "技能",
  unindexed: "未索引",
};

const DIRECTORY_GROUPS = [
  {
    title: "当前态",
    sub: "注意力规则 / 架构 / 领域与需求 / ADR",
    kinds: new Set([
      "AttentionDocument",
      "ArchitectureIndex",
      "ArchitectureDocument",
      "RequirementIndex",
      "RequirementDocument",
      "ADR",
    ]),
    filter: (entity) => entity.authority === "current-state",
  },
  {
    title: "工作状态",
    sub: "探路地图与决策 / 交付规格与工单",
    kinds: new Set([
      "DecisionMap",
      "Decision",
      "Delivery",
      "Specification",
      "Ticket",
    ]),
    filter: (entity) => entity.authority === "work-state",
  },
  {
    title: "演变与证据",
    sub: "项目历史 / Git 证据",
    kinds: new Set(["HistoryEntry", "GitCommit", "GitRepository"]),
    filter: (entity) =>
      entity.authority === "history" || entity.authority === "evidence",
  },
  {
    title: "读者与技能资料",
    sub: "README / 技能",
    kinds: new Set(["ReaderDocument", "Skill"]),
    filter: (entity) =>
      entity.kind === "Skill" || entity.kind === "ReaderDocument",
  },
];

// 主渲染：左栏搜索+筛选+目录导航，右栏结果与完整目录。
export function renderDocuments(snapshot, urlState, searchResult = null) {
  const activeQuery = urlState.query ?? "";
  const activeFilters = urlState.filters ?? "";
  const showUnindexed = urlState.unindexed === "1";
  const groups = DIRECTORY_GROUPS.map((group) => {
    const count = snapshot.entities.filter(
      (entity) => group.kinds.has(entity.kind) && group.filter(entity),
    ).length;
    return { id: `dir-${groupsSlug(group.title)}`, ...group, count };
  });

  const side = `
    ${sectionTitle("结构化搜索")}
    <form id="search-form" class="search-form" role="search">
      <label class="sr-only" for="search-input">搜索实体</label>
      <input id="search-input" name="q" type="search" value="${escapeHtml(activeQuery)}" placeholder="标题、路径、类型、状态、标签…">
      <button type="submit">搜索</button>
      ${activeQuery ? `<a class="clear-link" href="?view=documents">清除</a>` : ""}
    </form>
    <details class="filter-box" ${activeFilters ? "open" : ""}>
      <summary>筛选</summary>
      <div class="filter-row">
        ${selectFilter("类别", "category", CATEGORY_LABELS, snapshot, activeFilters)}
        ${selectFilter("类型", "kind", kindLabels(), snapshot, activeFilters)}
        ${selectFilter("状态", "state", { open: "打开", closed: "已关闭", unknown: "未知", clean: "clean", changed: "changed", accepted: "accepted", superseded: "superseded", unavailable: "unavailable" }, snapshot, activeFilters)}
        ${selectFilter("Readiness", "readiness", { frontier: "frontier", ready: "ready", claimed: "已认领", blocked: "被阻塞", none: "none", unknown: "未知" }, snapshot, activeFilters)}
        ${selectFilter("历史标签", "tag", { 功能: "功能", 缺陷: "缺陷", 重构: "重构", 演进: "演进" }, snapshot, activeFilters)}
        ${selectFilter("关系类型", "relation", { contains: "contains", "links-to": "links-to", "depends-on": "depends-on", "source-of": "source-of", "current-basis": "current-basis", evidence: "evidence", supersedes: "supersedes", "code-anchor": "code-anchor" }, snapshot, activeFilters)}
      </div>
      <label class="unindexed-toggle">
        <input type="checkbox" name="unindexed" value="1" ${showUnindexed ? "checked" : ""}>
        显示未索引文档
      </label>
    </details>
    ${sideNav(
      groups.map((group) => ({ id: group.id, label: group.title, count: group.count })),
      "文档目录导航",
    )}
  `;

  const main = `
    ${
      searchResult
        ? renderSearchResults(snapshot, urlState, searchResult)
        : urlState.query
          ? `<div class="search-results">${sectionTitle("搜索结果")}${skeleton(4)}</div>`
          : ""
    }
    ${sectionTitle("文档目录")}
    ${renderDirectory(snapshot, searchResult?.unindexed ?? [], groups)}
  `;

  return pageFrame(side, main);
}

function groupsSlug(title) {
  return title.replace(/\s+/g, "-");
}

function renderSearchResults(snapshot, urlState, result) {
  const query = result.query;
  const filters = result.filters ?? {};
  const filterSummary = Object.entries(filters)
    .flatMap(([key, values]) => values.map((value) => `${key}:${value}`))
    .join(", ");

  let body;
  if (query === "") {
    body = '<p class="empty">输入关键词开始搜索；首版仅查结构化字段，不提供全文搜索。</p>';
  } else if (result.total === 0) {
    body = `<div class="no-results">
      <p class="empty">没有匹配“${escapeHtml(query)}”的实体${filterSummary ? `（筛选：${escapeHtml(filterSummary)}）` : ""}。</p>
      <p class="sub">可搜索字段：${result.searchedFields.join("；")}</p>
      <p><a href="?view=documents">清除搜索与筛选，返回目录</a></p>
    </div>`;
  } else {
    body = `<p class="sub">${result.total} 个结果 · 查询“${escapeHtml(query)}”${filterSummary ? ` · 筛选 ${escapeHtml(filterSummary)}` : ""}</p>
      <ul class="list">${result.results
        .map(
          (item) => `<li>${entityLink(item.id, item.title)}
            <span class="meta">${escapeHtml(item.kind)}${item.category ? ` · ${CATEGORY_LABELS[item.category] ?? escapeHtml(item.category)}` : ""}</span>
            ${item.scope ? `<span class="sub">${escapeHtml(item.scope)}</span>` : ""}
            <span class="sub">${escapeHtml(item.path ?? "")}</span>
            ${item.state ? `<span class="sub">${escapeHtml(item.state)}</span>` : ""}
            ${item.readiness ? `<span class="sub">${escapeHtml(item.readiness)}</span>` : ""}
            ${item.validity === "valid" ? "" : pill(item.validity, "warn")}
            <span class="sub">命中：${item.hitFields.map(escapeHtml).join("、")}</span>
          </li>`,
        )
        .join("")}</ul>`;
  }

  return `<div class="search-results">${sectionTitle("搜索结果")}${body}</div>`;
}

function renderDirectory(snapshot, unindexed, groups = DIRECTORY_GROUPS.map((g) => ({ ...g, id: `dir-${groupsSlug(g.title)}` }))) {
  const parts = groups.map((group) => {
    const items = snapshot.entities
      .filter((entity) => group.kinds.has(entity.kind) && group.filter(entity))
      .sort((left, right) => left.id.localeCompare(right.id));
    return `<section id="${group.id}" class="page-anchor">${sectionTitle(`${group.title}（${items.length}）`)}
      <p class="sub">${group.sub}</p>
      ${
        items.length === 0
          ? '<p class="empty">未配置/无资料</p>'
          : `<ul class="list">${items
              .map(
                (item) => `<li>${entityLink(item.id, item.title)}
                  <span class="meta">${escapeHtml(item.kind)}</span>
                  ${item.scope ? `<span class="sub">${escapeHtml(item.scope)}</span>` : ""}
                  ${item.path ? `<span class="sub">${escapeHtml(item.path)}</span>` : ""}
                  ${item.validity === "valid" ? "" : pill(item.validity, "warn")}
                </li>`,
              )
              .join("")}</ul>`
      }</section>`;
  }).join("");

  const unindexedSection =
    unindexed.length === 0
      ? ""
      : `${sectionTitle(`未索引文档（${unindexed.length}）`)}
         <p class="sub">仅当显式切换“未索引文档”范围时列出；不进入默认目录与搜索。</p>
         <ul class="list">${unindexed
           .map(
             (item) => `<li><span class="meta">${escapeHtml(item.path)}</span> <span class="sub">${escapeHtml(item.reason)}</span></li>`,
           )
           .join("")}</ul>`;

  return parts + unindexedSection;
}

// 可见筛选控件（生成 filters URL 参数并自动提交）。
function selectFilter(label, key, options, snapshot, activeFilters) {
  const active = parseFilterValue(activeFilters, key);
  const optionHtml = Object.entries(options)
    .map(
      ([value, text]) =>
        `<option value="${escapeHtml(value)}" ${active.includes(value) ? "selected" : ""}>${escapeHtml(text)}</option>`,
    )
    .join("");
  return `<label class="filter-select">${escapeHtml(label)}
    <select name="${key}" multiple size="1">
      <option value="">全部</option>
      ${optionHtml}
    </select>
  </label>`;
}

function parseFilterValue(filters, key) {
  return String(filters ?? "")
    .split(",")
    .filter((part) => part.startsWith(`${key}:`))
    .map((part) => part.slice(key.length + 1));
}

function kindLabels() {
  return {
    AttentionDocument: "AttentionDocument",
    ArchitectureIndex: "ArchitectureIndex",
    ArchitectureDocument: "ArchitectureDocument",
    RequirementIndex: "RequirementIndex",
    RequirementDocument: "RequirementDocument",
    ADR: "ADR",
    DecisionMap: "DecisionMap",
    Decision: "Decision",
    Delivery: "Delivery",
    Specification: "Specification",
    Ticket: "Ticket",
    HistoryEntry: "HistoryEntry",
    GitRepository: "GitRepository",
    GitCommit: "GitCommit",
    CodeAnchor: "CodeAnchor",
    ReaderDocument: "ReaderDocument",
    Skill: "Skill",
  };
}

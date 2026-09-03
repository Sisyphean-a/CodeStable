// 全部文档：全集入口、精确搜索与稳定筛选。
// 目录、搜索结果和阅读页都指向同一份文档实体，不生成推荐或项目评价。

import {
  entityLink,
  escapeHtml,
  pill,
} from "./shared.js";

const CATEGORY_LABELS = {
  "current-state": "当前态",
  "work-state": "工作状态资料",
  history: "历史",
  "reader-document": "读者文档",
  skill: "技能",
  unindexed: "未索引",
};

const DIRECTORY_GROUPS = [
  {
    key: "当前态",
    title: "当前态",
    sub: "注意力规则、架构、领域与稳定规则",
    category: "current-state",
  },
  {
    key: "包与能力",
    title: "包与能力",
    sub: "按包定位职责、边界和代码锚点",
    category: "current-state",
    filter: (document) => document.path?.startsWith(".codestable/architecture/packages/"),
  },
  {
    key: "工作状态资料",
    title: "工作状态资料",
    sub: "探路、规格与工单的原始资料",
    category: "work-state",
  },
  {
    key: "历史",
    title: "历史",
    sub: "按月份保留的演变记录",
    category: "history",
  },
  {
    key: "读者与技能资料",
    title: "读者与技能资料",
    sub: "README 与可读技能入口",
    categories: new Set(["reader-document", "skill"]),
  },
];

export function renderDocuments(snapshot, urlState = {}, searchResult = null) {
  const documents = documentList(snapshot);
  const activeQuery = urlState.query ?? "";
  const activeFilters = urlState.filters ?? "";
  const showUnindexed = urlState.unindexed === "1";
  const groups = directoryGroups(documents);

  return `<section class="document-library">
    <header class="directory-header">
      <div>
        <p class="eyebrow">LIBRARY / INDEX</p>
        <h1>全部文档</h1>
        <p class="library-lede">按稳定路径和资料角色浏览 ${documents.length} 份可读资料。</p>
      </div>
      <a class="button button-quiet" href="?view=map">打开节点地图</a>
    </header>

    <form id="search-form" class="directory-search search-form" data-target-view="documents" role="search">
      <label class="sr-only" for="search-input">搜索项目资料</label>
      <span class="search-mark" aria-hidden="true">⌕</span>
      <input id="search-input" name="q" type="search" value="${escapeHtml(activeQuery)}" placeholder="标题、路径、包名、术语或正文…">
      <button type="submit">搜索资料</button>
      ${activeQuery || activeFilters ? '<a class="clear-link" href="?view=documents">清除</a>' : ""}
    </form>

    <details class="directory-filters" ${activeFilters || showUnindexed ? "open" : ""}>
      <summary>精确筛选 <span class="summary-note">只作用于已索引字段</span></summary>
      <div class="filter-row">
        ${selectFilter("类别", "category", CATEGORY_LABELS, activeFilters)}
        ${selectFilter("类型", "kind", kindLabels(), activeFilters)}
        ${selectFilter("状态", "state", {
          open: "打开",
          closed: "关闭",
          unknown: "未知",
          clean: "clean",
          changed: "changed",
          unavailable: "不可用",
        }, activeFilters)}
        ${selectFilter("Readiness", "readiness", {
          frontier: "frontier",
          ready: "ready",
          claimed: "已认领",
          blocked: "被阻塞",
          none: "none",
          unknown: "未知",
        }, activeFilters)}
        ${selectFilter("历史标签", "tag", {
          功能: "功能",
          缺陷: "缺陷",
          重构: "重构",
          演进: "演进",
        }, activeFilters)}
        ${selectFilter("关系类型", "relation", {
          contains: "contains",
          "links-to": "links-to",
          "depends-on": "depends-on",
          "source-of": "source-of",
          "current-basis": "current-basis",
          evidence: "evidence",
          "code-anchor": "code-anchor",
        }, activeFilters)}
      </div>
      <label class="unindexed-toggle">
        <input type="checkbox" name="unindexed" value="1" ${showUnindexed ? "checked" : ""}>
        显示未索引 Markdown（仅列路径，不进入默认目录）
      </label>
    </details>

    ${searchResult || activeQuery ? renderSearchResults(snapshot, urlState, searchResult) : ""}
    <div class="directory-body">
      ${groups.map((group) => renderDirectoryGroup(group)).join("")}
    </div>
    ${searchResult?.unindexed?.length ? renderUnindexed(searchResult.unindexed) : ""}
  </section>`;
}

function documentList(snapshot) {
  if (Array.isArray(snapshot.documents)) return snapshot.documents;
  const kinds = new Set([
    "AttentionDocument",
    "ArchitectureIndex",
    "ArchitectureDocument",
    "RequirementIndex",
    "RequirementDocument",
    "HistoryDocument",
    "DecisionMap",
    "Decision",
    "Specification",
    "Ticket",
    "ReaderDocument",
    "Skill",
  ]);
  return (snapshot.entities ?? [])
    .filter((entity) => kinds.has(entity.kind) && entity.path)
    .map((entity) => ({
      ...entity,
      category: entity.category ?? categoryForEntity(entity),
      group: entity.path.startsWith(".codestable/architecture/packages/")
        ? "包与能力"
        : categoryForEntity(entity) === "work-state"
          ? "工作状态资料"
          : categoryForEntity(entity) === "history"
            ? "历史"
            : categoryForEntity(entity) === "current-state"
              ? "当前态"
              : "读者与技能资料",
    }));
}

function categoryForEntity(entity) {
  if (entity.kind === "HistoryDocument") return "history";
  if (entity.authority === "work-state") return "work-state";
  if (entity.authority === "current-state") return "current-state";
  if (entity.kind === "Skill") return "skill";
  return "reader-document";
}

function directoryGroups(documents) {
  return DIRECTORY_GROUPS.map((group, index) => {
    const items = documents
      .filter((document) => {
        if (group.filter && !group.filter(document)) return false;
        if (group.categories) return group.categories.has(document.category);
        return document.category === group.category &&
          (group.key !== "当前态" || !document.path?.startsWith(".codestable/architecture/packages/"));
      })
      .sort((left, right) => String(left.path).localeCompare(String(right.path)));
    return { ...group, id: `directory-${index}`, items };
  });
}

function renderDirectoryGroup(group) {
  return `<section id="${escapeHtml(group.id)}" class="directory-group page-anchor">
    <header class="directory-group-head">
      <div>
        <h2>${escapeHtml(group.title)}</h2>
        <p>${escapeHtml(group.sub)}</p>
      </div>
      <span class="section-count">${group.items.length}</span>
    </header>
    ${group.items.length
      ? `<ul class="document-list">${group.items.map(renderDocument).join("")}</ul>`
      : '<p class="empty">暂无纳入的资料</p>'}
  </section>`;
}

function renderDocument(document) {
  const label = document.group === "包与能力" && document.scope?.startsWith("package:")
    ? document.scope
    : document.title ?? document.path;
  const link = document.id
    ? entityLink(document.id, label)
    : `<span class="document-title">${escapeHtml(label)}</span>`;
  const state = document.validity === "valid"
    ? ""
    : pill(document.validity === "unavailable" ? "读取失败" : "资料不完整", "danger");
  const meta = [document.kind, document.path, document.scope].filter(Boolean).join(" · ");
  return `<li class="document-row">
    <div class="document-row-main">${link}${state}</div>
    <span class="document-path meta">${escapeHtml(meta)}</span>
  </li>`;
}

function renderSearchResults(snapshot, urlState, result) {
  if (!result) return '<section class="search-results"><p class="empty">正在查找资料…</p></section>';
  if (result.error) {
    return `<section class="search-results"><header class="search-results-head"><h2>搜索失败</h2></header><div class="empty-panel"><p>资料搜索请求失败，未把失败伪装成空结果。</p><p class="sub">${escapeHtml(result.error)}</p><a href="?view=documents">返回全部文档</a></div></section>`;
  }
  const query = result.query ?? urlState.query ?? "";
  const filters = result.filters ?? {};
  const filterSummary = Object.entries(filters)
    .flatMap(([key, values]) => values.map((value) => `${key}:${value}`))
    .join("、");
  if (!query) {
    return `<section class="search-results"><h2>搜索结果</h2><p class="empty">输入关键词开始搜索。搜索只匹配明确的文档字段和正文术语。</p></section>`;
  }
  if (result.total === 0) {
    return `<section class="search-results">
      <header class="search-results-head"><h2>搜索结果</h2><span class="section-count">0</span></header>
      <div class="empty-panel">
        <p>没有匹配“${escapeHtml(query)}”的资料${filterSummary ? `（筛选：${escapeHtml(filterSummary)}）` : ""}。</p>
        <p class="sub">可搜索字段：${escapeHtml((result.searchedFields ?? []).join("；"))}</p>
        <a href="?view=documents">清除搜索与筛选，返回目录</a>
      </div>
    </section>`;
  }
  return `<section class="search-results">
    <header class="search-results-head">
      <div><h2>搜索结果</h2><p class="sub">查询“${escapeHtml(query)}”${filterSummary ? ` · ${escapeHtml(filterSummary)}` : ""}</p></div>
      <span class="section-count">${result.total} 个结果</span>
    </header>
    <ul class="document-list search-result-list">${result.results.map(renderSearchResult).join("")}</ul>
  </section>`;
}

function renderSearchResult(item) {
  const state = item.validity === "valid" ? "" : pill(item.validity, "warn");
  const meta = [item.kind, CATEGORY_LABELS[item.category] ?? item.category, item.path].filter(Boolean).join(" · ");
  return `<li class="document-row search-result-row">
    <div class="document-row-main">${entityLink(item.id, item.title)}${state}</div>
    <span class="document-path meta">${escapeHtml(meta)}</span>
    ${item.snippet ? `<p class="search-snippet">${escapeHtml(item.snippet)}</p>` : ""}
    ${item.hitFields?.length ? `<span class="hit-fields">命中：${escapeHtml(item.hitFields.join("、"))}</span>` : ""}
  </li>`;
}

function renderUnindexed(items) {
  return `<section class="unindexed-section">
    <header class="directory-group-head"><div><h2>未索引文档（Markdown）</h2><p>这些文件保留为路径信息，没有被面板解释或生成对象。</p></div><span class="section-count">${items.length}</span></header>
    <ul class="document-list">${items.map((item) => `<li class="document-row"><span class="document-path meta">${escapeHtml(item.path)}</span><span class="sub">${escapeHtml(item.reason)}</span></li>`).join("")}</ul>
  </section>`;
}

function selectFilter(label, key, options, activeFilters) {
  const active = parseFilterValue(activeFilters, key);
  const optionHtml = Object.entries(options)
    .map(([value, text]) => `<option value="${escapeHtml(value)}" ${active.includes(value) ? "selected" : ""}>${escapeHtml(text)}</option>`)
    .join("");
  return `<label class="filter-select">${escapeHtml(label)}
    <select name="${escapeHtml(key)}" multiple size="1">
      <option value="">全部</option>${optionHtml}
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
    HistoryDocument: "HistoryDocument",
    DecisionMap: "DecisionMap",
    Decision: "Decision",
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

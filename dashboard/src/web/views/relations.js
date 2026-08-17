// 关系视图：以选中实体为中心的局部关系图（入向在左、出向在右），
// 覆盖全部正式关系 kind；筛选不改变原始关系事实；手动逐层展开；
// unresolved/external/unsafe 保留原始目标，不可错误导航为成功页面。

import { entityLink, escapeHtml, emptyState, pill, sectionTitle } from "./shared.js";
import { renderDag } from "../graph.js";

const KIND_LABELS = {
  contains: "包含",
  "links-to": "链接",
  "depends-on": "硬依赖",
  "source-of": "来源规格",
  "current-basis": "当前依据",
  evidence: "证据",
  supersedes: "替代",
  "code-anchor": "代码锚点",
};

const RESOLUTION_LABELS = {
  resolved: "已解析",
  unresolved: "未解析",
  external: "外部",
  unsafe: "不安全",
};

export function renderRelations(snapshot, urlState, relationData = null, error = null) {
  const target = urlState.entity ?? "";
  return `
    ${sectionTitle("关系探索")}
    <p class="sub">以选中实体为中心：入向关系在左、当前对象居中、出向关系在右；只显示正式关系。</p>
    <form id="relation-pick" class="search-form" role="search">
      <label class="sr-only" for="relation-entity">选择实体</label>
      <select id="relation-entity" name="entity" class="relation-select">
        <option value="">选择一个实体…</option>
        ${renderEntityOptions(snapshot, target)}
      </select>
      <button type="submit">查看关系</button>
      ${target ? `<a class="clear-link" href="?view=relations">清除</a>` : ""}
    </form>
    <details class="filter-box" ${urlState.filters ? "open" : ""}>
      <summary>筛选关系（不改变原始关系事实）</summary>
      <div class="filter-row">
        ${kindFilter(urlState.filters)}
        ${resolutionFilter(urlState.filters)}
      </div>
    </details>

    ${
      !target
        ? emptyState("先选择一个实体，或从任意阅读页进入关系探索。")
        : error === "load-failed"
          ? '<p class="empty">关系数据加载失败。</p>'
          : relationData
            ? renderRelationGraph(snapshot, urlState, relationData)
            : '<p class="empty">正在加载关系图…</p>'
    }
  `;
}

function renderEntityOptions(snapshot, target) {
  const excluded = new Set(["GitRepository", "Project", "GitCommit"]);
  return snapshot.entities
    .filter((entity) => !excluded.has(entity.kind))
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(
      (entity) =>
        `<option value="${escapeHtml(entity.id)}" ${entity.id === target ? "selected" : ""}>${escapeHtml(entity.title)}（${escapeHtml(entity.kind)}）</option>`,
    )
    .join("");
}

function kindFilter(activeFilters) {
  const active = parseFilterValue(activeFilters, "kind");
  const options = Object.entries(KIND_LABELS)
    .map(
      ([value, text]) =>
        `<option value="${value}" ${active.includes(value) ? "selected" : ""}>${escapeHtml(text)}（${value}）</option>`,
    )
    .join("");
  return `<label class="filter-select">关系类型
    <select name="kind" multiple size="1"><option value="">全部</option>${options}</select>
  </label>`;
}

function resolutionFilter(activeFilters) {
  const active = parseFilterValue(activeFilters, "resolution");
  const options = Object.entries(RESOLUTION_LABELS)
    .map(
      ([value, text]) =>
        `<option value="${value}" ${active.includes(value) ? "selected" : ""}>${escapeHtml(text)}</option>`,
    )
    .join("");
  return `<label class="filter-select">解析状态
    <select name="resolution" multiple size="1"><option value="">全部</option>${options}</select>
  </label>`;
}

function parseFilterValue(filters, key) {
  return String(filters ?? "")
    .split(",")
    .filter((part) => part.startsWith(`${key}:`))
    .map((part) => part.slice(key.length + 1));
}

function renderRelationGraph(snapshot, urlState, data) {
  const depth = Number(urlState.depth) || 1;
  const entity = snapshot.entities.find((item) => item.id === urlState.entity);
  const filtersActive = Boolean(urlState.filters);
  const rendered = renderDag(data, {
    title: `关系图：${entity?.title ?? urlState.entity}`,
    edgeLabel: (edge) => {
      const kindText = KIND_LABELS[edge.kind] ?? edge.kind;
      const resolutionText = RESOLUTION_LABELS[edge.resolution] ?? edge.resolution;
      return `${kindText}${edge.resolution === "resolved" ? "" : `（${resolutionText}）`}`;
    },
    legend: `<div class="dag-legend">
      <span>入向关系在左、出向关系在右；箭头指向关系目标</span>
      <span class="legend-state">边文字：关系类型（未解析/外部/不安全时标注状态）</span>
      <span class="legend-unresolved">虚线：未解析目标，不伪造成功节点</span>
    </div>`,
    textListTitle: "完整文字关系列表",
  });
  const filterUrl = (filters) =>
    `?view=relations&entity=${encodeURIComponent(urlState.entity)}&depth=${depth}${filters ? `&filters=${encodeURIComponent(filters)}` : ""}`;
  return `
    <h3>${escapeHtml(entity?.title ?? urlState.entity)}<span class="meta">${escapeHtml(urlState.entity)}</span></h3>
    <p><a class="clear-link" href="?view=relations">关闭，返回选择</a></p>
    ${rendered.legend}
    ${rendered.svg}
    ${rendered.truncation ? `<p class="dag-truncation">${escapeHtml(rendered.truncation)}</p>` : ""}
    <p class="sub">${filtersActive ? `已应用筛选：${escapeHtml(urlState.filters)} · ` : ""}深度 ${depth}</p>
    <p>
      <a class="action-link" href="${escapeHtml(filterUrl(""))}">重置筛选</a>
      <a class="action-link" href="${escapeHtml(filterUrl(urlState.filters))}&depth=${depth + 1}">再展开一层（深度 ${depth + 1}）</a>
    </p>
    ${rendered.textListHtml}
  `;
}

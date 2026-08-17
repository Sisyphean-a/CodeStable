// 探路视图：decision 行动列表（当前前沿 / 已认领 / 被阻塞 / 已关闭）
// + 按需展开的决策依赖 DAG（只含 decision，20 节点/40 边有界）。
// 每项显示生命周期、认领者、可行动/阻塞原因与依赖数。

import { emptyState, entityLink, escapeHtml, lifecycleTone, pill, sectionTitle } from "./shared.js";
import { renderDag } from "../graph.js";

const GROUPS = [
  { readiness: "frontier", title: "当前前沿", reason: "前置决策已关闭且未被认领" },
  { readiness: "claimed", title: "已认领", reason: "已有认领者" },
  { readiness: "blocked", title: "被阻塞", reason: "存在未关闭或未解析的前置依赖" },
  { readiness: "unknown", title: "状态未知", reason: "状态枚举未知，不能视为可行动" },
  { readiness: "none", title: "已关闭", reason: "" },
];

const FILTER_KEYS = ["state", "owner", "direction", "resolution"];

export function renderWayfinding(snapshot, urlState, graphData = null) {
  if (snapshot.maps.length === 0) {
    return '<p class="empty">探路地图：未配置/无资料</p>';
  }
  const activeFilters = urlState.filters ?? "";
  const graphOpen = Boolean(urlState.entity && graphData);

  return `
    ${sectionTitle("决策行动列表")}
    ${renderList(snapshot, activeFilters)}
    ${graphOpen ? renderGraphSection(snapshot, urlState, graphData) : ""}
  `;
}

function renderList(snapshot, activeFilters) {
  const filterSet = new Set(
    String(activeFilters)
      .split(",")
      .filter(Boolean),
  );
  const filtered = (decision) => {
    for (const key of FILTER_KEYS) {
      const values = [...filterSet]
        .filter((part) => part.startsWith(`${key}:`))
        .map((part) => part.slice(key.length + 1));
      if (values.length === 0) continue;
      if (key === "state" && !values.includes(decision.state ?? "")) return false;
      if (key === "owner" && !values.includes(decision.owner ?? "")) return false;
      if (key === "direction" && values.includes("outgoing") !== true) continue;
      if (key === "resolution" && !values.includes(decision.resolution ?? "")) continue;
    }
    return true;
  };

  return snapshot.maps
    .map((map) => {
      const byReadiness = new Map(
        GROUPS.map((group) => [
          group.readiness,
          { ...group, items: [] },
        ]),
      );
      for (const decision of map.decisions ?? []) {
        const group = byReadiness.get(decision.readiness);
        if (group && filtered(decision)) group.items.push(decision);
      }
      return `${sectionTitle(`${map.name} · 全部决策（${map.decisions.length}）`)}
        ${
          activeFilters
            ? `<p class="sub">已应用筛选：${escapeHtml(activeFilters)} <a href="?view=wayfinding">清除</a></p>`
            : ""
        }
        ${GROUPS.filter((group) => byReadiness.get(group.readiness).items.length > 0)
          .map((group) => {
            const { items } = byReadiness.get(group.readiness);
            return `<div class="group">
              <h3>${escapeHtml(group.title)}（${items.length}）<span class="sub">${escapeHtml(group.reason)}</span></h3>
              <ul class="list">${items
                .map(
                  (item) => `<li>
                    ${entityLink(item.id, item.title)}
                    ${pill(lifecycleTone("Decision", item.state, item.readiness).text, lifecycleTone("Decision", item.state, item.readiness).tone)}
                    ${item.owner ? `<span class="meta">认领者 ${escapeHtml(item.owner)}</span>` : ""}
                    <span class="meta">依赖 ${item.dependencies}</span>
                    ${item.state === "unknown" ? '<span class="sub">状态未知，不能视为可行动</span>' : ""}
                    <a class="graph-link" href="?view=wayfinding&entity=${encodeURIComponent(item.id)}&depth=1">查看依赖</a>
                  </li>`,
                )
                .join("")}</ul>
            </div>`;
          })
          .join("")}
        `;
    })
    .join("");
}

function renderGraphSection(snapshot, urlState, graphData) {
  const rendered = renderDag(graphData);
  const depth = Number(urlState.depth) || 1;
  const entity = snapshot.entities.find((item) => item.id === urlState.entity);
  return `${sectionTitle(`依赖图：${entity?.title ?? urlState.entity}（深度 ${depth}）`)}
    <p><a class="clear-link" href="?view=wayfinding">关闭图，返回行动列表</a></p>
    ${rendered.legend}
    ${rendered.svg}
    ${rendered.truncation ? `<p class="dag-truncation">${escapeHtml(rendered.truncation)}</p>` : ""}
    <p>
      <a class="action-link" href="?view=wayfinding&entity=${encodeURIComponent(urlState.entity)}&depth=${depth + 1}">再展开一层（深度 ${depth + 1}）</a>
    </p>
    ${rendered.textListHtml}
  `;
}

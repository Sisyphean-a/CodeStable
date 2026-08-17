// 交付视图：ticket 行动列表（Ready / 已认领 / 被阻塞 / 已关闭）
// + 按需展开的 ticket 依赖 DAG（只含 ticket，20 节点/40 边有界）。
// 每项显示状态、认领者、来源规格、可行动/阻塞原因与依赖数。

import { emptyState, entityLink, escapeHtml, lifecycleTone, pill, sectionTitle } from "./shared.js";
import { renderDag } from "../graph.js";

const GROUPS = [
  { readiness: "ready", title: "Ready", reason: "前置工单已关闭且未被认领" },
  { readiness: "claimed", title: "已认领", reason: "已有认领者" },
  { readiness: "blocked", title: "被阻塞", reason: "存在未关闭或未解析的前置依赖" },
  { readiness: "unknown", title: "状态未知", reason: "状态枚举未知，不能视为 ready" },
  { readiness: "none", title: "已关闭", reason: "" },
];

export function renderDelivery(snapshot, urlState, graphData = null) {
  if (snapshot.deliveries.length === 0) {
    return '<p class="empty">交付面：未配置/无资料</p>';
  }
  const graphOpen = Boolean(urlState.entity && graphData);
  return `
    ${sectionTitle("工单行动列表")}
    ${renderList(snapshot)}
    ${graphOpen ? renderGraphSection(snapshot, urlState, graphData) : ""}
  `;
}

function renderList(snapshot) {
  return snapshot.deliveries
    .map((delivery) => {
      const specLink = delivery.hasSpec
        ? `<p class="sub">${entityLink(`Specification:${delivery.specPath}`, `规格：${delivery.specPath}`)}</p>`
        : '<p class="sub">规格：未配置</p>';
      const byReadiness = new Map(
        GROUPS.map((group) => [group.readiness, { ...group, items: [] }]),
      );
      for (const ticket of delivery.tickets ?? []) {
        const group = byReadiness.get(ticket.readiness);
        if (group) group.items.push(ticket);
      }
      return `${sectionTitle(`${delivery.name} · 全部工单（${delivery.tickets.length}）`)}
        ${specLink}
        ${GROUPS.filter((group) => byReadiness.get(group.readiness).items.length > 0)
          .map((group) => {
            const { items } = byReadiness.get(group.readiness);
            return `<div class="group">
              <h3>${escapeHtml(group.title)}（${items.length}）<span class="sub">${escapeHtml(group.reason)}</span></h3>
              <ul class="list">${items
                .map(
                  (item) => `<li>
                    ${entityLink(item.id, item.title)}
                    ${pill(lifecycleTone("Ticket", item.state, item.readiness).text, lifecycleTone("Ticket", item.state, item.readiness).tone)}
                    ${item.owner ? `<span class="meta">认领者 ${escapeHtml(item.owner)}</span>` : ""}
                    <span class="meta">依赖 ${item.dependencies}</span>
                    ${item.deliveryType ? `<span class="sub">${escapeHtml(item.deliveryType)}</span>` : ""}
                    ${item.state === "unknown" ? '<span class="sub">状态未知，不能视为 ready</span>' : ""}
                    <a class="graph-link" href="?view=delivery&entity=${encodeURIComponent(item.id)}&depth=1">查看依赖</a>
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
    <p><a class="clear-link" href="?view=delivery">关闭图，返回行动列表</a></p>
    ${rendered.legend}
    ${rendered.svg}
    ${rendered.truncation ? `<p class="dag-truncation">${escapeHtml(rendered.truncation)}</p>` : ""}
    <p>
      <a class="action-link" href="?view=delivery&entity=${encodeURIComponent(urlState.entity)}&depth=${depth + 1}">再展开一层（深度 ${depth + 1}）</a>
    </p>
    ${rendered.textListHtml}
  `;
}

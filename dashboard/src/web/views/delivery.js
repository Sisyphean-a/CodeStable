// 交付视图：ticket 行动列表（Ready / 已认领 / 被阻塞 / 已关闭）
// + 按需展开的 ticket 依赖 DAG（只含 ticket，20 节点/40 边有界）。
// 左栏为生命周期分组导航，右栏为行动列表与依赖图。

import {
  entityLink,
  escapeHtml,
  lifecycleTone,
  pageFrame,
  pill,
  sectionTitle,
  sideNav,
  skeleton,
} from "./shared.js";
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
  // 选中实体即展示图区块：数据未到时显示骨架，避免点击后区域消失。
  const graphOpen = Boolean(urlState.entity);

  const counts = countByReadiness(snapshot);
  const ticketTotal = snapshot.deliveries.reduce((sum, d) => sum + d.tickets.length, 0);
  const side = `
    ${sideNav(
      GROUPS.filter((group) => counts.get(group.readiness) > 0).map((group) => ({
        id: `dl-${group.readiness}`,
        label: group.title,
        count: counts.get(group.readiness),
      })),
      "工单分组导航",
    )}
    <div class="side-card">
      <p class="side-card-title">交付面</p>
      <p class="sub">共 ${snapshot.deliveries.length} 个交付面${ticketTotal > 0 ? ` · ${ticketTotal} 张工单` : ""}</p>
    </div>
  `;

  const main = `
    ${sectionTitle("工单行动列表")}
    ${renderList(snapshot)}
    ${graphOpen ? renderGraphSection(snapshot, urlState, graphData) : ""}
  `;

  return pageFrame(side, main);
}

function countByReadiness(snapshot) {
  const counts = new Map(GROUPS.map((group) => [group.readiness, 0]));
  for (const delivery of snapshot.deliveries ?? []) {
    for (const ticket of delivery.tickets ?? []) {
      if (counts.has(ticket.readiness)) {
        counts.set(ticket.readiness, counts.get(ticket.readiness) + 1);
      }
    }
  }
  return counts;
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
            return `<section id="dl-${group.readiness}" class="page-anchor group">
              <h3>${escapeHtml(group.title)}（${items.length}）<span class="sub">${escapeHtml(group.reason)}</span></h3>
              <ul class="list">${items
                .map(
                  (item) => {
                    const tone = lifecycleTone("Ticket", item.state, item.readiness);
                    return `<li>
                    ${entityLink(item.id, item.title)}
                    ${pill(tone.text, tone.tone)}
                    ${item.owner ? `<span class="meta">认领者 ${escapeHtml(item.owner)}</span>` : ""}
                    <span class="meta">依赖 ${item.dependencies}</span>
                    ${item.deliveryType ? `<span class="sub">${escapeHtml(item.deliveryType)}</span>` : ""}
                    ${item.state === "unknown" ? '<span class="sub">状态未知，不能视为 ready</span>' : ""}
                    <a class="graph-link" href="?view=delivery&entity=${encodeURIComponent(item.id)}&depth=1">查看依赖</a>
                  </li>`;
                  },
                )
                .join("")}</ul>
            </section>`;
          })
          .join("")}
        `;
    })
    .join("");
}

function renderGraphSection(snapshot, urlState, graphData) {
  const depth = Number(urlState.depth) || 1;
  const entity = snapshot.entities.find((item) => item.id === urlState.entity);
  if (graphData === null) {
    return `${sectionTitle(`依赖图：${entity?.title ?? urlState.entity}（深度 ${depth}）`)}
      <p><a class="clear-link" href="?view=delivery">关闭图，返回行动列表</a></p>
      ${skeleton(6)}
    `;
  }
  const rendered = renderDag(graphData);
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
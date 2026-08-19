// 当前态视图：按注意力规则 / 架构 / 领域与需求 / ADR 分组列出当前态资料。
// 左栏为分组锚点导航，右栏为各组内容。

import {
  entityLink,
  escapeHtml,
  pageFrame,
  pill,
  sectionTitle,
  sideNav,
} from "./shared.js";

const GROUPS = [
  { key: "AttentionDocument", title: "注意力规则" },
  { key: "ArchitectureIndex", title: "架构索引" },
  { key: "ArchitectureDocument", title: "架构" },
  { key: "RequirementIndex", title: "领域上下文入口" },
  { key: "RequirementDocument", title: "领域与需求" },
  { key: "ADR", title: "架构决定记录" },
];

export function renderState(snapshot) {
  const entities = snapshot.entities;
  const groups = GROUPS.map((group, index) => {
    const id = `state-${index}`;
    const items = entities
      .filter(
        (entity) =>
          entity.kind === group.key &&
          entity.authority === "current-state",
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    return {
      ...group,
      id,
      items,
      body:
        items.length === 0
          ? '<p class="empty">未配置/无资料</p>'
          : `<ul class="list">${items
              .map(
                (item) => `<li>${entityLink(item.id, item.title)}
                  <span class="meta">${escapeHtml(item.path ?? "")}</span>
                  ${item.validity === "valid" ? "" : pill(item.validity, "warn")}
                  ${item.scope ? `<span class="sub">${escapeHtml(item.scope)}</span>` : ""}</li>`,
              )
              .join("")}</ul>`,
    };
  });

  const side = sideNav(
    groups.map((group) => ({
      id: group.id,
      label: group.title,
      count: group.items.length,
    })),
    "当前态导航",
  );

  const main = groups
    .map(
      (group) =>
        `<section id="${group.id}" class="page-anchor">${sectionTitle(group.title)}${group.body}</section>`,
    )
    .join("");

  return pageFrame(side, main);
}
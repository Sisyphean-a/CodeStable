// 当前态视图：按注意力规则 / 架构 / 领域与需求 / ADR 分组列出当前态资料。

import { entityLink, escapeHtml, pill, sectionTitle } from "./shared.js";

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
  const parts = [];
  for (const group of GROUPS) {
    const items = entities
      .filter(
        (entity) =>
          entity.kind === group.key &&
          entity.authority === "current-state",
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    parts.push(
      sectionTitle(group.title) +
        (items.length === 0
          ? '<p class="empty">未配置/无资料</p>'
          : `<ul class="list">${items
              .map(
                (item) => `<li>${entityLink(item.id, item.title)}
                  <span class="meta">${escapeHtml(item.path ?? "")}</span>
                  ${item.validity === "valid" ? "" : pill(item.validity, "warn")}
                  ${item.scope ? `<span class="sub">${escapeHtml(item.scope)}</span>` : ""}</li>`,
              )
              .join("")}</ul>`),
    );
  }
  return parts.join("");
}

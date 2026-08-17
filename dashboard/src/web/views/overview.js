// 概览视图：项目身份 → 权威阅读路径 → 当前项目地图 → 语义演变 →
// 当前注意力 → 继续入口。未配置来源显示未配置，不显示零进度。

import {
  emptyState,
  entityLink,
  escapeHtml,
  pill,
  sectionTitle,
  unconfigured,
} from "./shared.js";

export function renderOverview(snapshot) {
  const overview = snapshot.overview;
  const identity = overview.identity;
  const git = identity.git;

  const gitLine = git.available
    ? `${escapeHtml(git.branch)} · ${git.changed > 0 ? `${git.changed} 个变更` : "工作区干净"}`
    : escapeHtml(git.branch);

  return `
    <section class="identity">
      <h1>${escapeHtml(identity.name)}</h1>
      <p class="meta">${gitLine} · ${identity.skillCount} 个技能</p>
    </section>

    ${sectionTitle("权威阅读路径")}
    ${overview.readingPath.length === 0
      ? emptyState("未发现当前态资料")
      : `<ul class="list">${overview.readingPath
          .map(
            (item) => `<li>${entityLink(item.id, item.title)} <span class="meta">${escapeHtml(item.kind)} · ${escapeHtml(item.path)}</span>${item.validity === "valid" ? "" : pill(item.validity, "warn")}</li>`,
          )
          .join("")}</ul>`}

    ${sectionTitle("当前项目地图")}
    ${overview.hasWayfinding
      ? `<ul class="list">${overview.maps
          .map(
            (map) => `<li>${entityLink(`DecisionMap:${map.path}`, map.name)}
              <span class="meta">已关闭 ${map.closed} · 打开 ${map.open}${map.unknown ? ` · 未知 ${map.unknown}` : ""} · 前沿 ${map.frontier} · 迷雾 ${map.fog}</span>
              ${map.progress == null ? pill("无决策", "neutral") : pill(`${map.progress}%`, "neutral")}</li>`,
          )
          .join("")}</ul>`
      : unconfigured("探路地图")}

    ${sectionTitle("语义演变")}
    ${overview.hasHistory
      ? `<ul class="list">${overview.evolution.months
          .map(
            (month) =>
              `<li><span class="item-title">${escapeHtml(month.name)}</span> <span class="meta">${month.entries} 条有效变化${month.invalid > 0 ? ` · ${month.invalid} 条格式错误` : ""}</span>${month.invalid > 0 ? pill("需检查", "warn") : ""}</li>`,
          )
          .join("")}</ul>`
      : unconfigured("项目历史")}

    ${sectionTitle("当前注意力")}
    <div class="attention-box">
      ${
        overview.attention.configured
          ? `<p class="sub">${escapeHtml(overview.attention.summary)}</p>`
          : `<p class="empty">注意力规则：未配置</p>`
      }
      <p class="meta">
        决策 ${overview.work.decisions} · 工单 ${overview.work.tickets} ·
        前沿 ${overview.work.frontier} · Ready ${overview.work.ready} ·
        已认领 ${overview.work.claimed} · 被阻塞 ${overview.work.blocked} ·
        已关闭 ${overview.work.closed}
      </p>
    </div>

    ${sectionTitle("继续入口")}
    ${
      overview.continue.length === 0
        ? emptyState("当前没有可行动的前沿或 Ready 工单")
        : `<div class="continue-list">${overview.continue
            .map(
              (item) =>
                `<a href="?view=reader&entity=${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a> <span class="sub">${escapeHtml(item.reason)}</span>`,
            )
            .join("")}</div>`
    }
  `;
}

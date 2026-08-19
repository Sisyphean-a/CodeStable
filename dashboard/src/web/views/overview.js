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
  const packages = identity.packages?.join("、") || "未声明";
  const scopes = identity.scopes?.join("、") || "未声明";
  const gitLine = git.available
    ? `${escapeHtml(git.branch)} · ${git.changed > 0 ? `${git.changed} 个变更` : "工作区干净"}`
    : escapeHtml(git.branch);
  const summary = identity.summary
    ? `<p class="summary">${escapeHtml(identity.summary)}</p>`
    : '<p class="empty">项目简述：未配置/无资料</p>';
  const fallback = identity.nameFallback
    ? '<span class="sub">显示名回退：架构索引未配置</span>'
    : "";

  return `
    <section class="identity">
      <h1>${escapeHtml(identity.name)}</h1>
      ${summary}
      <p class="meta">仓库根：${escapeHtml(identity.root)} · 包：${escapeHtml(packages)} · 范围：${escapeHtml(scopes)}</p>
      <p class="meta">${gitLine} · ${identity.skillCount} 个技能 ${fallback}</p>
    </section>

    ${renderStats(overview.work)}

    ${sectionTitle("权威阅读路径")}
    ${overview.readingPath.length === 0
      ? emptyState("未发现当前态资料")
      : `<ul class="list">${overview.readingPath
          .map(
            (item) => `<li>${entityLink(item.id, item.title)} <span class="meta">${escapeHtml(item.kind)} · ${escapeHtml(item.path)}</span>${item.validity === "valid" ? "" : pill(item.validity, "warn")}<p class="sub">先读理由：${escapeHtml(item.reason ?? "补充当前态依据和定位入口")}</p></li>`,
          )
          .join("")}</ul>`}

    ${sectionTitle("当前项目地图")}
    ${renderCurrentMap(overview.currentMap)}

    ${sectionTitle("语义演变")}
    ${renderEvolution(overview)}

    ${sectionTitle("当前注意力")}
    <div class="attention-box">
      ${overview.attention.configured
        ? `<p class="sub">${escapeHtml(overview.attention.summary ?? "")}</p>`
        : `<p class="empty">注意力规则：未配置</p>`}
      ${renderAttention(overview.attention.items ?? [])}
      <p class="meta">
        决策 ${overview.work.decisions} · 工单 ${overview.work.tickets} ·
        前沿 ${overview.work.frontier} · Ready ${overview.work.ready} ·
        已认领 ${overview.work.claimed} · 被阻塞 ${overview.work.blocked} ·
        已关闭 ${overview.work.closed}
      </p>
    </div>

    ${sectionTitle("继续入口")}
    ${overview.continue.length === 0
      ? emptyState("当前没有可行动的前沿或 Ready 工单")
      : `<div class="continue-list">${overview.continue
          .map(
            (item) =>
              `<a href="?view=reader&entity=${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a> <span class="sub">${escapeHtml(item.reason)}</span>`,
          )
          .join("")}</div>`}
  `;
}

function renderStats(work) {
  const stats = [
    { value: work.decisions, label: "决策", tone: "" },
    { value: work.tickets, label: "工单", tone: "" },
    { value: work.frontier, label: "当前前沿", tone: "ok" },
    { value: work.ready, label: "Ready", tone: "ok" },
    { value: work.blocked, label: "被阻塞", tone: work.blocked > 0 ? "danger" : "" },
    { value: work.closed, label: "已关闭", tone: "" },
  ];
  return `<div class="stat-grid">${stats
    .map(
      (stat) => `<div class="stat-card">
        <div class="stat-value tone-${stat.tone}">${escapeHtml(stat.value)}</div>
        <div class="stat-label">${escapeHtml(stat.label)}</div>
      </div>`,
    )
    .join("")}</div>`;
}

function renderCurrentMap(currentMap) {
  if (!currentMap?.configured || currentMap.entries.length === 0) {
    return unconfigured("当前态项目地图");
  }
  const scopes = currentMap.scopes.join("、") || "未声明";
  const packages = currentMap.packages.join("、") || "未声明";
  const contexts = currentMap.contexts.join("、") || "未声明";
  return `<p class="sub">范围：${escapeHtml(scopes)} · 包：${escapeHtml(packages)} · 领域上下文：${escapeHtml(contexts)}</p>
    <ul class="list">${currentMap.entries
      .map(
        (entry) => `<li>
          ${entityLink(entry.id, entry.title)}
          <span class="meta">${escapeHtml(entry.kind)} · ${escapeHtml(entry.path)}</span>
          <p class="sub">范围：${escapeHtml(entry.scope || "未声明")}${entry.package ? ` · 包：${escapeHtml(entry.package)}` : ""}${entry.context ? ` · 领域上下文：${escapeHtml(entry.context)}` : ""}</p>
          ${entry.publicBoundary.length > 0 ? `<p class="sub">公开边界：${escapeHtml(entry.publicBoundary.join("；"))}</p>` : ""}
          ${entry.codeAnchors.length > 0 ? `<p class="sub">代码锚点：${escapeHtml(entry.codeAnchors.join("；"))}</p>` : ""}
        </li>`,
      )
      .join("")}</ul>`;
}

function renderEvolution(overview) {
  const entries = overview.evolution.entries ?? [];
  if (entries.length > 0) {
    return `<ol class="timeline">${entries.map(renderHistoryEntry).join("")}</ol>`;
  }
  return overview.hasHistory
    ? emptyState("尚无有效语义历史")
    : unconfigured("项目历史");
}

function renderHistoryEntry(entry) {
  return `<li>
    <div class="item-line"><span class="meta">${escapeHtml(entry.date)}</span> ${pill(entry.tag, "neutral")} <span class="item-title">${escapeHtml(entry.result)}</span></div>
    <p class="sub">范围：${escapeHtml(entry.range)}</p>
    <p class="reason">原因：${escapeHtml(entry.reason)}</p>
    <p class="sub">当前依据：${renderCurrentBasis(entry.currentBasis)}</p>
  </li>`;
}

function renderCurrentBasis(currentBasis) {
  const items = currentBasis?.items ?? [];
  if (items.length === 0) {
    return escapeHtml(currentBasis?.raw || "—");
  }
  return items
    .map((item) => {
      const label = item.text || item.targetTitle || item.href || "（未解析）";
      if (item.targetId && item.resolution === "resolved") {
        return `<a href="?view=reader&entity=${encodeURIComponent(item.targetId)}">${escapeHtml(label)}</a>`;
      }
      return `<span class="sub">${escapeHtml(label)}</span>`;
    })
    .join("、");
}

function renderAttention(items) {
  if (items.length === 0) return emptyState("当前没有活跃注意力");
  return `<ul class="list">${items
    .map((item) => {
      const title = item.targetId
        ? entityLink(item.targetId, item.title)
        : `<span class="item-title">${escapeHtml(item.title)}</span>`;
      const path = item.path && item.path !== item.title
        ? `<span class="meta">${escapeHtml(item.path)}</span>`
        : "";
      const owner = item.owner ? ` · 认领者：${escapeHtml(item.owner)}` : "";
      return `<li>
        ${title} ${pill(item.status, attentionTone(item))} <span class="meta">${escapeHtml(item.kind)}${owner}</span>
        ${path}
        <p class="sub">原因：${escapeHtml(item.reason)}</p>
      </li>`;
    })
    .join("")}</ul>`;
}

function attentionTone(item) {
  if (item.kind === "Diagnostic" || item.status === "被阻塞") return "danger";
  if (item.kind === "WorkspaceChange" || item.status === "已认领") return "warn";
  return "ok";
}

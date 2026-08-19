// 历史视图：语义历史时间线。按语义历史格式排序（月文件日期逆序、
// 同日写入顺序）；筛选不改变来源事实；Git/代码路径作为带类型 evidence；
// 有依据的演变链标注边类型，无依据时保持时间线。

import { emptyState, escapeHtml, pill, sectionTitle, skeleton } from "./shared.js";

const TAG_TONES = {
  功能: "ok",
  缺陷: "danger",
  重构: "warn",
  演进: "neutral",
};

const CHAIN_KIND_LABELS = {
  "current-basis": "当前依据",
  evidence: "证据",
  supersedes: "替代",
  "links-to": "链接",
};

export function renderHistory(snapshot, urlState, historyData = null) {
  const activeTheme = urlState.theme ?? "";
  const activeFilters = urlState.historyFilters ?? "";
  return `
    ${sectionTitle("语义历史")}
    <form id="history-filter" class="search-form" role="search">
      <label class="sr-only" for="history-theme">按规范主题筛选历史</label>
      <input id="history-theme" name="theme" type="search" value="${escapeHtml(activeTheme)}" placeholder="按规范主题筛选（结果 / 原因 / 证据）">
      <button type="submit">筛选</button>
      ${activeFilters || activeTheme ? `<a class="clear-link" href="?view=history">清除</a>` : ""}
    </form>
    <details class="filter-box" ${activeFilters ? "open" : ""}>
      <summary>按字段筛选</summary>
      <div class="filter-row">
        ${fieldFilter("date", "日期（YYYY-MM）")}
        ${fieldFilter("tag", "标签（功能/缺陷/重构/演进）")}
        ${fieldFilter("range", "范围")}
        ${fieldFilter("basis", "当前依据")}
      </div>
    </details>
    <p class="sub">只有完整可解析的语义历史条目计入时间线；Git 提交、代码路径与原始来源仅作为 evidence 呈现。</p>

    ${
      historyData
        ? renderTimeline(historyData)
        : skeleton(5)
    }
  `;
}

function fieldFilter(name, label) {
  return `<label class="filter-select">${escapeHtml(label)}
    <input type="text" name="${name}" placeholder="留空即全部">
  </label>`;
}

function renderTimeline(data) {
  if (data.total === 0) {
    return `<div class="no-results">
      <p class="empty">没有匹配的历史条目${data.theme ? `（主题“${escapeHtml(data.theme)}”）` : ""}。</p>
      <p class="sub">可筛选字段：${data.searchedFields.join("；")}</p>
      <p><a href="?view=history">清除筛选，返回完整时间线</a></p>
    </div>`;
  }
  const parts = data.months.map(
    (month) => `
      ${sectionTitle(`${month.name}（${month.entries.length}）`)}
      <ol class="timeline">${month.entries.map(renderEntry).join("")}</ol>
    `,
  );
  const invalid = data.invalidCount;
  return `${parts.join("")}
    <p class="sub">共 ${data.total} 条有效条目${invalid > 0 ? `；另有 ${invalid} 条格式错误行不计入时间线，可在诊断中定位` : ""}。</p>`;
}

function renderEntry(entry) {
  return `<li class="timeline-entry">
    <div class="timeline-head">
      <span class="meta">${escapeHtml(entry.date)}</span>
      ${pill(entry.tag, TAG_TONES[entry.tag] ?? "neutral")}
      <span class="item-title">${escapeHtml(entry.result)}</span>
      <span class="sub">${escapeHtml(entry.range)}</span>
    </div>
    <p class="reason">${escapeHtml(entry.reason)}</p>
    <dl class="entry-fields">
      <dt>当前依据</dt>
      <dd>${renderBasis(entry)}</dd>
      <dt>证据</dt>
      <dd>${renderEvidence(entry)}</dd>
    </dl>
    ${renderChain(entry.chain)}
  </li>`;
}

// 当前依据：已解析目标进入阅读；未解析保留原文与状态。
function renderBasis(entry) {
  const items = (entry.chain ?? []).filter(
    (item) => item.kind === "current-basis",
  );
  if (items.length === 0) {
    return entry.currentBasis?.raw
      ? `<span class="sub">${escapeHtml(entry.currentBasis.raw)}</span>`
      : '<span class="sub">—</span>';
  }
  return items
    .map((item) =>
      item.resolution === "resolved" && item.to
        ? `<a href="?view=reader&entity=${encodeURIComponent(item.to)}">${escapeHtml(item.text ?? item.targetTitle ?? item.to)}</a>`
        : `<span class="sub">${escapeHtml(item.text ?? item.originalTarget ?? "（未解析）")}</span>`,
    )
    .join("、");
}

// 证据：commit → GitCommit 阅读；路径 → 实体阅读；会话 → 外部不可导航。
function renderEvidence(entry) {
  const items = (entry.chain ?? []).filter((item) => item.kind === "evidence");
  if (items.length === 0) {
    return entry.evidence?.raw
      ? `<span class="sub">${escapeHtml(entry.evidence.raw)}</span>`
      : '<span class="sub">—</span>';
  }
  return items
    .map((item) => {
      if (item.resolution === "resolved" && item.to) {
        const label = item.to.startsWith("GitCommit:") ? "提交" : "代码";
        return `<a href="?view=reader&entity=${encodeURIComponent(item.to)}" class="evidence-link"><span class="meta">${label}</span>${escapeHtml(item.text ?? item.targetTitle ?? item.to)}</a>`;
      }
      if (item.resolution === "external") {
        return `<span class="sub evidence-external">${escapeHtml(item.text ?? item.originalTarget ?? "")}</span>`;
      }
      return `<span class="sub">${escapeHtml(item.text ?? item.originalTarget ?? "（未解析）")}</span>`;
    })
    .join("、");
}

// 演变链：只显示有明确关系依据的边并标注边类型；无依据时无此区块。
function renderChain(chain) {
  if (!chain || chain.length === 0) return "";
  return `<ul class="chain">${chain
    .map(
      (item) => `<li>
        <span class="meta">${escapeHtml(CHAIN_KIND_LABELS[item.kind] ?? item.kind)}</span>
        ${
          item.resolution === "resolved" && item.to
            ? `<a href="?view=reader&entity=${encodeURIComponent(item.to)}">${escapeHtml(item.targetTitle ?? item.to)}</a>`
            : `<span class="sub">${escapeHtml(item.originalTarget ?? "（未解析）")}</span>`
        }
        ${pill(item.resolution, item.resolution === "resolved" ? "ok" : "warn")}
        <span class="sub">${escapeHtml(item.field ?? "")}</span>
      </li>`,
    )
    .join("")}</ul>`;
}

// 历史视图：语义历史时间线。按语义历史格式排序（月文件日期逆序、
// 同日写入顺序）；筛选不改变来源事实。
// 条目只保留日期、标签、结果、范围与原因；依据与证据不再展开。
// 左栏为筛选与月份导航，右栏为时间线。

import {
  escapeHtml,
  pageFrame,
  pill,
  sectionTitle,
  sideNav,
  skeleton,
} from "./shared.js";

const TAG_TONES = {
  功能: "ok",
  缺陷: "danger",
  重构: "warn",
  演进: "neutral",
};

export function renderHistory(snapshot, urlState, historyData = null) {
  const activeTheme = urlState.theme ?? "";
  const activeFilters = urlState.historyFilters ?? "";

  const side = `
    ${sectionTitle("筛选")}
    <form id="history-filter" class="search-form" role="search">
      <label class="sr-only" for="history-theme">按规范主题筛选历史</label>
      <input id="history-theme" name="theme" type="search" value="${escapeHtml(activeTheme)}" placeholder="按规范主题筛选（结果 / 原因）">
      <button type="submit">筛选</button>
      ${activeFilters || activeTheme ? `<a class="clear-link" href="?view=history">清除</a>` : ""}
    </form>
    <details class="filter-box" ${activeFilters ? "open" : ""}>
      <summary>按字段筛选</summary>
      <div class="filter-row">
        ${fieldFilter("date", "日期（YYYY-MM）")}
        ${fieldFilter("tag", "标签（功能/缺陷/重构/演进）")}
        ${fieldFilter("range", "范围")}
      </div>
    </details>
    ${
      historyData && historyData.months.length > 0
        ? sideNav(
            historyData.months.map((month) => ({
              id: `month-${month.path}`,
              label: month.name,
              count: month.entries.length,
            })),
            "月份导航",
          )
        : ""
    }
  `;

  const main = `
    <p class="sub">只有完整可解析的语义历史条目计入时间线；条目只显示结果与原因。</p>
    ${
      historyData
        ? renderTimeline(historyData)
        : skeleton(5)
    }
  `;

  return pageFrame(side, main);
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
      <section id="month-${escapeHtml(month.path)}" class="page-anchor">
        ${sectionTitle(`${month.name}（${month.entries.length}）`)}
        <ol class="timeline">${month.entries.map(renderEntry).join("")}</ol>
      </section>
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
    </div>
    ${entry.range ? `<p class="sub">范围：${escapeHtml(entry.range)}</p>` : ""}
    <p class="reason">原因：${escapeHtml(entry.reason)}</p>
  </li>`;
}
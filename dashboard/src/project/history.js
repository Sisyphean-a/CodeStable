// 语义历史投影：按语义历史格式的真实排序（月文件日期逆序、同日写入顺序）
// 提供时间线；支持日期、范围、标签、当前依据与规范主题筛选；
// Git/代码路径只作为带类型的 evidence 呈现，不冒充第二条时间线。

const HISTORY_TAGS = ["功能", "缺陷", "重构", "演进"];

// 历史时间线投影。筛选不改变来源事实与稳定排序。
export function historyProjection(index, options = {}) {
  const filters = parseHistoryFilters(options.filters ?? "");
  const theme = normalizeTheme(options.theme);

  const entries = index.entities
    .filter((entity) => entity.kind === "HistoryEntry")
    .filter((entry) => applyHistoryFilters(entry, filters))
    .filter((entry) => themeMatches(entry, theme));

  const entitiesById = new Map(index.entities.map((entity) => [entity.id, entity]));
  const relationsFrom = new Map();
  for (const relation of index.relations) {
    if (!relationsFrom.has(relation.from)) relationsFrom.set(relation.from, []);
    relationsFrom.get(relation.from).push(relation);
  }

  const timeline = entries
    .map((entry) => {
      const chain = (relationsFrom.get(entry.id) ?? [])
        .filter((relation) =>
          ["current-basis", "evidence", "supersedes", "links-to"].includes(
            relation.kind,
          ),
        )
        .map((relation) => ({
          kind: relation.kind,
          resolution: relation.resolution,
          to: relation.to,
          targetTitle: relation.to
            ? entitiesById.get(relation.to)?.title ?? null
            : null,
          targetKind: relation.to
            ? entitiesById.get(relation.to)?.kind ?? null
            : null,
          originalTarget: relation.originalTarget ?? null,
          field: relation.provenance?.field ?? null,
          text: relation.provenance?.text ?? null,
        }))
        .sort(byKindThenTarget);
      return {
        id: entry.id,
        date: entry.date,
        tag: entry.tag,
        result: entry.title,
        range: entry.range,
        reason: entry.reason,
        currentBasis: entry.currentBasis ?? null,
        evidence: entry.evidence ?? null,
        sourcePath: entry.source?.id?.replace(/^source:/, "") ?? null,
        sequence: entry.sourceOrder ?? 0,
        startLine: entry.startLine ?? null,
        chain,
      };
    })
    .sort(byTimelineOrder);

  // 月份分组：按月文件（来源路径）聚合，月内保持时间线顺序。
  const months = new Map();
  for (const entry of timeline) {
    const key = entry.sourcePath ?? "";
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(entry);
  }
  const monthGroups = [...months.entries()]
    .map(([path, items]) => ({
      path,
      name: monthName(path),
      entries: items,
    }))
    .sort((left, right) => right.name.localeCompare(left.name));

  return {
    total: timeline.length,
    filters,
    theme: theme || null,
    searchedFields: [
      "日期",
      "范围",
      "标签",
      "当前依据",
      "规范主题（结果/原因/证据）",
    ],
    months: monthGroups,
    invalidCount: countInvalid(index),
  };
}

function monthName(sourcePath) {
  const match = sourcePath?.match(/(\d{4}-\d{2})\.md$/);
  return match?.[1] ?? sourcePath ?? "";
}

// 时间线顺序：月文件日期逆序，同日按写入顺序。
function byTimelineOrder(left, right) {
  const monthLeft = left.sourcePath ?? "";
  const monthRight = right.sourcePath ?? "";
  if (monthLeft !== monthRight) return monthRight.localeCompare(monthLeft);
  if (left.date !== right.date) return right.date.localeCompare(left.date);
  return left.sequence - right.sequence;
}

function byKindThenTarget(left, right) {
  if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
  return String(left.to ?? left.originalTarget ?? "").localeCompare(
    String(right.to ?? right.originalTarget ?? ""),
  );
}

// 筛选：date（YYYY-MM 前缀）、range（范围字段包含）、tag、basis（当前依据文本包含）。
export function parseHistoryFilters(filters) {
  const result = {};
  if (!filters) return result;
  for (const part of String(filters).split(",")) {
    const index = part.indexOf(":");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!value) continue;
    if (["date", "range", "tag", "basis"].includes(key)) {
      if (!result[key]) result[key] = [];
      result[key].push(value);
    }
  }
  return result;
}

function applyHistoryFilters(entry, filters) {
  if (filters.date && !filters.date.some((value) => entry.date.startsWith(value))) {
    return false;
  }
  if (filters.tag && !filters.tag.includes(entry.tag)) return false;
  if (filters.range && !filters.range.some((value) => entry.range.includes(value))) {
    return false;
  }
  if (
    filters.basis &&
    !filters.basis.some((value) =>
      String(entry.currentBasis?.raw ?? "").includes(value),
    )
  ) {
    return false;
  }
  return true;
}

// 规范主题：匹配结果、原因或证据文本（多词 AND）。
function themeMatches(entry, theme) {
  if (!theme || theme.length === 0) return true;
  const haystack = [
    entry.title,
    entry.reason,
    entry.range,
    entry.evidence?.raw ?? "",
    entry.currentBasis?.raw ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return theme.every((term) => haystack.includes(term));
}

export function normalizeTheme(theme) {
  if (!theme) return [];
  return String(theme)
    .toLowerCase()
    .replace(/[\s,，、]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function countInvalid(index) {
  return index.diagnostics.filter(
    (diagnostic) => diagnostic.code === "history-format",
  ).length;
}

export { HISTORY_TAGS };

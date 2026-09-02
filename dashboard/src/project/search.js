// 结构化搜索：只查 ProjectIndex 已知实体的已确认字段，支持中文关键词、
// 大小写不敏感英文、路径片段、多词 AND 与可见筛选。
// 正文段落参与术语搜索；任意 frontmatter 键值和未索引 Markdown 不参与搜索。

const AUTHORITY_ORDER = [
  "environment",
  "current-state",
  "work-state",
  "history",
  "reader-document",
  "evidence",
];

// ProjectIndex 在一次快照生命周期内不可变；缓存只读搜索投影，避免热查询重复扫描关系和正文。
const SEARCH_CONTEXT_CACHE = new WeakMap();

function searchContext(index) {
  const cached = SEARCH_CONTEXT_CACHE.get(index);
  if (cached) return cached;

  const sourcesById = new Map(index.sources.map((source) => [source.id, source]));
  const entitiesById = new Map(index.entities.map((entity) => [entity.id, entity]));
  const relationsFrom = new Map();
  for (const relation of index.relations) {
    const list = relationsFrom.get(relation.from) ?? [];
    list.push(relation);
    relationsFrom.set(relation.from, list);
  }
  const context = { sourcesById, entitiesById, relationsFrom, projectionsById: new Map() };
  SEARCH_CONTEXT_CACHE.set(index, context);
  return context;
}

function getSearchableEntity(entity, context) {
  const cached = context.projectionsById.get(entity.id);
  if (cached) return cached;
  const projection = searchableEntity(
    entity,
    context.sourcesById,
    context.entitiesById,
    context.relationsFrom,
  );
  context.projectionsById.set(entity.id, projection);
  return projection;
}

// 每个实体的可搜索字段投影。
function searchableEntity(entity, sourcesById, entitiesById, relationsFrom) {
  const source = entity.source ? sourcesById.get(entity.source.id) : null;
  const outgoing = [
    ...(relationsFrom.get(entity.id) ?? []),
    ...(entity.source ? relationsFrom.get(entity.source.id) ?? [] : []),
  ];
  const relationKinds = [...new Set(outgoing.map((relation) => relation.kind))];
  const resolutions = [...new Set(outgoing.map((relation) => relation.resolution))];
  const relationTargets = [
    ...new Set(
      outgoing
        .map((relation) =>
          relation.to ? entitiesById.get(relation.to)?.title : null,
        )
        .filter(Boolean),
    ),
  ];
  return {
    id: entity.id,
    kind: entity.kind,
    title: entity.title,
    category: source?.category ?? null,
    authority: entity.authority,
    path: source?.path ?? entity.id.replace(/^[^:]+:/, ""),
    scope: entity.scope ?? null,
    state: entity.state ?? null,
    stateLabels: stateLabels(entity.state),
    readiness: entity.readiness ?? null,
    readinessLabels: readinessLabels(entity.readiness),
    tag: entity.tag ?? null,
    date: entity.date ?? null,
    range: entity.range ?? null,
    validity: entity.validity,
    headings: source?.headings.map((heading) => heading.text) ?? [],
    relationKinds,
    relationTargets,
    resolutions,
    content: contentWithoutHeadings(source?.content ?? ""),
    sourceOrder: entity.sourceOrder ?? 0,
  };
}

const STATE_LABELS = {
  open: ["open", "打开"],
  closed: ["closed", "关闭", "已关闭"],
  unknown: ["unknown", "未知"],
  accepted: ["accepted", "已接受"],
  superseded: ["superseded", "已替代"],
  clean: ["clean", "干净"],
  changed: ["changed", "变更"],
  unavailable: ["unavailable", "不可用"],
};

const READINESS_LABELS = {
  frontier: ["frontier", "当前前沿"],
  ready: ["ready", "就绪"],
  claimed: ["claimed", "已认领"],
  blocked: ["blocked", "被阻塞"],
  none: ["none"],
  unknown: ["unknown", "未知"],
};

function stateLabels(state) {
  return state ? STATE_LABELS[state] ?? [state] : [];
}

function readinessLabels(readiness) {
  return readiness ? READINESS_LABELS[readiness] ?? [readiness] : [];
}

// 规范化查询词：小写、统一空白/斜杠/连字符/下划线/常见标点。
export function normalizeTerm(term) {
  return String(term)
    .toLowerCase()
    .replace(/[\s/\\_\-.,;:，。；：、()（）[\]【】]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 路径分段匹配：查询词命中任一路径段的前缀或整段。
function matchesPathSegment(term, path) {
  const segments = String(path).toLowerCase().split("/");
  return segments.some((segment) => segment.startsWith(term));
}

function fieldMatches(term, value) {
  if (value == null) return false;
  return String(value).toLowerCase().includes(term);
}

// 每个词必须在同一实体的可搜索字段中命中（多词 AND）。
function matchesEntity(term, entity) {
  const fields = [
    entity.title,
    entity.id,
    entity.path,
    entity.kind,
    entity.category,
    entity.authority,
    entity.scope,
    entity.state,
    ...entity.stateLabels,
    entity.readiness,
    ...entity.readinessLabels,
    entity.tag,
    entity.date,
    entity.range,
    ...entity.headings,
    ...entity.relationKinds,
    ...entity.relationTargets,
    entity.content,
  ];  if (
    fields.some((value) => fieldMatches(term, value)) ||
    matchesPathSegment(term, entity.path)
  ) {
    return true;
  }
  return false;
}

// 命中字段清单（结果解释用）。
function matchedFields(term, entity) {
  const hits = [];
  const check = (name, value) => {
    if (fieldMatches(term, value) || (name === "path" && matchesPathSegment(term, value))) {
      hits.push(name);
    }
  };
  check("标题", entity.title);
  check("ID", entity.id);
  check("路径", entity.path);
  check("类型", entity.kind);
  check("类别", entity.category);
  check("权威", entity.authority);
  check("范围", entity.scope);
  check("状态", entity.state);
  check("readiness", entity.readiness);
  check("标签", entity.tag);
  check("日期", entity.date);
  check("历史范围", entity.range);
  for (const heading of entity.headings) {
    if (String(heading).toLowerCase().includes(term)) {
      hits.push("标题目录");
      break;
    }
  }
  for (const kind of entity.relationKinds) {
    if (fieldMatches(term, kind)) {
      hits.push("关系类型");
      break;
    }
  }
  for (const target of entity.relationTargets) {
    if (fieldMatches(term, target)) {
      hits.push("关系目标");
      break;
    }
  }
  if (fieldMatches(term, entity.content)) hits.push("正文");
  return [...new Set(hits)];
}

function rankScore(term, entity) {
  const title = String(entity.title).toLowerCase();
  const id = String(entity.id).toLowerCase();
  const path = String(entity.path).toLowerCase();
  if (title === term) return 0;
  if (id === term || id.includes(`:${term}`)) return 1;
  if (path === term || path.endsWith(`/${term}`) || path.startsWith(`${term}/`)) return 1;
  const headingHit = entity.headings.some((heading) =>
    String(heading).toLowerCase().startsWith(term),
  );
  if (headingHit) return 2;
  return 3;
}

const FILTER_KEYS = new Set([
  "kind",
  "category",
  "authority",
  "scope",
  "state",
  "readiness",
  "tag",
  "validity",
  "relation",
  "resolution",
]);

// filters: "kind:Decision,state:open,readiness:frontier" 形式。
export function parseFilters(filters) {
  const result = {};
  if (!filters) return result;
  for (const part of String(filters).split(",")) {
    const index = part.indexOf(":");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (FILTER_KEYS.has(key) && value) {
      if (!result[key]) result[key] = [];
      result[key].push(value);
    }
  }
  return result;
}

export function applyFilters(entity, filters) {
  for (const [key, values] of Object.entries(filters)) {
    if (key === "kind" && !values.includes(entity.kind)) return false;
    if (key === "category" && !values.includes(entity.category ?? "")) return false;
    if (key === "authority" && !values.includes(entity.authority)) return false;
    if (key === "scope" && !values.includes(entity.scope ?? "")) return false;
    if (key === "state" && !values.includes(entity.state ?? "")) return false;
    if (key === "readiness" && !values.includes(entity.readiness ?? "")) return false;
    if (key === "tag" && !values.includes(entity.tag ?? "")) return false;
    if (key === "validity" && !values.includes(entity.validity)) return false;
    if (key === "relation" && !values.some((value) => entity.relationKinds.includes(value))) return false;
    if (key === "resolution") {
      // 关系解析状态筛选：该实体存在指定解析状态的关系。
      if (!values.some((value) => entity.resolutions?.includes(value))) return false;
    }
  }
  return true;
}

// 搜索投影。query 为空时返回空结果（目录仍由客户端展示）。
export function searchProjection(index, options = {}) {
  const query = options.query ?? "";
  const filters = parseFilters(options.filters);
  const includeUnindexed = options.includeUnindexed === true;

  const context = searchContext(index);

  // 未索引文档：仅在显式切换范围时列出路径与原因；不进搜索结果。
  const unindexed = includeUnindexed
    ? index.sources
        .filter((source) => source.category === "unindexed")
        .map((source) => ({
          path: source.path,
          reason: "未在受支持资料位置，未建立结构化实体",
          validity: source.validity,
        }))
        .sort((left, right) => left.path.localeCompare(right.path))
    : [];

  const terms = normalizeTerm(query)
    .split(" ")
    .filter(Boolean);

  if (terms.length === 0) {
    return {
      query,
      searchedFields: searchFields(),
      filters: Object.fromEntries(Object.entries(filters).filter(([, v]) => v.length)),
      results: [],
      total: 0,
      unindexed,
      includeUnindexed,
    };
  }

  const results = [];
  for (const entity of index.entities) {
    if (entity.kind === "SourceDocument") continue;
    // 先用原始实体做廉价筛选，避免 kind 过滤下为整份历史正文建立投影。
    if (filters.kind && !filters.kind.includes(entity.kind)) continue;
    const projection = getSearchableEntity(entity, context);
    if (!applyFilters(projection, filters)) continue;
    if (terms.every((term) => matchesEntity(term, projection))) {
      const bestScore = Math.min(
        ...terms.map((term) => rankScore(term, projection)),
      );
      const hitFields = [
        ...new Set(terms.flatMap((term) => matchedFields(term, projection))),
      ];
      const authorityRank = Math.max(
        0,
        AUTHORITY_ORDER.indexOf(projection.authority),
      );
      results.push({
        entity: projection,
        score: {
          match: bestScore,
          authority: authorityRank,
          sourceOrder: projection.sourceOrder,
          path: projection.path,
        },
        hitFields,
      });
    }
  }

  results.sort((left, right) => {
    if (left.score.match !== right.score.match) {
      return left.score.match - right.score.match;
    }
    if (left.score.authority !== right.score.authority) {
      return left.score.authority - right.score.authority;
    }
    if (left.score.sourceOrder !== right.score.sourceOrder) {
      return left.score.sourceOrder - right.score.sourceOrder;
    }
    return left.score.path.localeCompare(right.score.path);
  });

  return {
    query,
    searchedFields: searchFields(),
    filters: Object.fromEntries(Object.entries(filters).filter(([, v]) => v.length)),
    results: results.map(({ entity, hitFields }) => ({
      id: entity.id,
      kind: entity.kind,
      title: entity.title,
      category: entity.category,
      authority: entity.authority,
      scope: entity.scope,
      path: entity.path,
      state: entity.state,
      readiness: entity.readiness,
      validity: entity.validity,
      hitFields,
      snippet: contentSnippet(entity.content, terms),
    })),
    total: results.length,
    unindexed,
    includeUnindexed,
  };
}

export function searchFields() {
  return [
    "实体标题",
    "仓库相对路径与规范实体 ID",
    "Markdown 标题目录",
    "实体类型与资料类别",
    "scope / 包 / 领域与权威层级",
    "Decision/Ticket/ADR/Git 状态与 readiness",
    "历史日期、标签、范围、当前依据和证据标识",
    "正式关系类型、已解析关系目标与代码锚点",
    "Markdown 正文中的可检索规范术语",
  ];
}

function contentWithoutHeadings(content) {
  return String(content)
    .split("\n")
    .filter((line) => !/^\s*#{1,6}\s+/.test(line))
    .join("\n");
}

function contentSnippet(content, terms) {
  const text = String(content ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const lowered = text.toLowerCase();
  const position = terms
    .map((term) => lowered.indexOf(term))
    .filter((value) => value >= 0)
    .sort((left, right) => left - right)[0];
  if (position == null) return "";
  const start = Math.max(0, position - 48);
  const end = Math.min(text.length, position + 132);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

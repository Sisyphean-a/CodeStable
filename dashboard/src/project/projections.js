// 兼容快照投影：既有 maps/deliveries/history/git/skills/project 结构
// 全部由 ProjectIndex 派生，页面不得绕过索引重新解释项目文件。

import { basename } from "node:path";
import { firstHeading } from "./markdown.js";

export function createSnapshotProjection(index, snapshotState) {
  const { entities, sources, relations } = index;
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const sourcesByPath = new Map(sources.map((source) => [source.path, source.id]));
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const relationsFrom = new Map();
  for (const relation of relations) {
    if (!relationsFrom.has(relation.from)) relationsFrom.set(relation.from, []);
    relationsFrom.get(relation.from).push(relation);
  }

  const maps = [];
  const deliveries = [];
  const history = [];
  const skills = [];
  let git = { available: false, branch: "not a git repository", changed: 0, changes: [], commit: "" };

  for (const entity of entities) {
    if (entity.kind === "DecisionMap") {
      maps.push(projectMap(index, entity, relationsFrom, sourcesById, entitiesById));
    } else if (entity.kind === "Delivery") {
      deliveries.push(
        projectDelivery(index, entity, relationsFrom, sourcesByPath, entitiesById),
      );
    } else if (entity.kind === "Skill") {
      skills.push(entity.name || entity.title);
    } else if (entity.kind === "GitRepository") {
      const headCommit = entity.headCommit
        ? entities.find((candidate) => candidate.id === `GitCommit:${entity.headCommit}`)
        : null;
      git = {
        available: entity.state !== "unavailable",
        branch: entity.branch,
        changed: entity.changed,
        changes: entity.changes ?? [],
        state: entity.state,
        commit: headCommit
          ? `${headCommit.short ?? headCommit.hash.slice(0, 7)} ${headCommit.date ?? ""} ${headCommit.subject}`.trim()
          : "",
      };
    }
  }

  for (const source of sources) {
    if (source.category !== "history") continue;
    const entries = entities.filter(
      (entity) =>
        entity.kind === "HistoryEntry" &&
        entity.source?.id === source.id,
    );
    const invalid = index.diagnostics.filter(
      (diagnostic) =>
        diagnostic.code === "history-format" &&
        diagnostic.source === source.id,
    ).length;
    history.push({
      name: firstHeading(source.content) ?? basename(source.path, ".md"),
      path: source.path,
      entries: entries.length,
      invalid,
      validity: source.validity,
    });
  }
  history.sort((left, right) => right.name.localeCompare(left.name));

  const projectEntity = entities.find((entity) => entity.kind === "Project");
  const diagnosticSummary = summarizeDiagnostics(index.diagnostics);
  const state = {
    status: snapshotState?.status ?? "fresh",
    generatedAt: index.generatedAt,
    ...(snapshotState?.staleSince != null ? { staleSince: snapshotState.staleSince } : {}),
    ...(snapshotState?.lastError != null ? { lastError: snapshotState.lastError } : {}),
  };
  const entitySummaries = entities.map((entity) =>
    entitySummary(entity, sourcesById),
  );

  return {
    schemaVersion: index.schemaVersion,
    project: {
      root: ".",
      name: projectEntity?.title ?? index.project.name,
      hasArchitectureIndex: index.project.hasArchitectureIndex,
      hasRequirementsContext: index.project.hasRequirementsContext,
    },
    maps: maps.sort((left, right) => left.name.localeCompare(right.name)),
    deliveries: deliveries.sort((left, right) => left.path.localeCompare(right.path)),
    history,
    git,
    skills: skills.sort(),
    scannedAt: index.generatedAt,
    snapshot: state,
    diagnostics: diagnosticSummary,
    overview: buildOverview(index, {
      maps,
      deliveries,
      history,
      git,
      projectEntity,
      sourcesById,
      entitiesById,
      relationsFrom,
      entitySummaries,
    }),
    entities: entitySummaries,
  };
}

function entitySummary(entity, sourcesById) {
  const source = entity.source ? sourcesById.get(entity.source.id) : null;
  const summary = {
    id: entity.id,
    kind: entity.kind,
    title: entity.title,
    validity: entity.validity,
    authority: entity.authority,
  };
  if (source) {
    summary.category = source.category;
    summary.path = source.path;
  }
  for (const key of ["state", "owner", "readiness", "scope", "date", "tag", "deliveryType"]) {
    if (entity[key] != null && entity[key] !== "") summary[key] = entity[key];
  }
  return summary;
}

function projectMap(index, mapEntity, relationsFrom, sourcesById, entitiesById) {
  const source = mapEntity.source ? sourcesById.get(mapEntity.source.id) : null;
  const contained = relationsFrom.get(mapEntity.id) ?? [];
  const decisionIds = contained
    .filter((relation) => relation.kind === "contains" && relation.to?.startsWith("Decision:"))
    .map((relation) => relation.to);
  const decisions = decisionIds
    .map((id) => entitiesById.get(id))
    .filter(Boolean);
  const mapText = source?.content ?? "";
  const fog =
    sectionLineCount(mapText, "迷雾") || sectionLineCount(mapText, "Fog");
  const closed = decisions.filter((decision) => decision.state === "closed").length;
  const open = decisions.filter((decision) => decision.state === "open").length;
  const unknown = decisions.filter((decision) => decision.state === "unknown").length;
  const blocked = decisions.filter((decision) => decision.readiness === "blocked").length;
  const frontier = decisions.filter((decision) => decision.readiness === "frontier").length;
  const claimed = decisions.filter((decision) => decision.readiness === "claimed").length;
  return {
    name: mapEntity.title,
    path: mapEntity.id.replace(/^DecisionMap:/, ""),
    closed,
    open,
    unknown,
    blocked,
    frontier,
    claimed,
    fog,
    progress: progress(closed, decisions.length + fog),
    validity: source?.validity ?? "unavailable",
    decisions: decisions.map((decision) => {
      const relations = relationsFrom.get(decision.id) ?? [];
      return {
        id: decision.id,
        title: decision.title,
        state: decision.state,
        owner: decision.owner,
        readiness: decision.readiness,
        dependencies: relations.filter(
          (relation) => relation.kind === "depends-on",
        ).length,
        path: decision.id.replace(/^Decision:/, ""),
      };
    }),
  };
}

function projectDelivery(index, deliveryEntity, relationsFrom, sourcesByPath, entitiesById) {
  const contained = relationsFrom.get(deliveryEntity.id) ?? [];
  const specIds = contained
    .filter((relation) => relation.kind === "contains" && relation.to?.startsWith("Specification:"))
    .map((relation) => relation.to);
  const ticketIds = contained
    .filter((relation) => relation.kind === "contains" && relation.to?.startsWith("Ticket:"))
    .map((relation) => relation.to);
  const tickets = ticketIds
    .map((id) => entitiesById.get(id))
    .filter(Boolean);
  const deliveryPath = deliveryEntity.id.replace(/^Delivery:/, "");
  const specPath = specIds.length > 0 ? specIds[0].replace(/^Specification:/, "") : `${deliveryPath}/spec.md`;
  const closed = tickets.filter((ticket) => ticket.state === "closed").length;
  const open = tickets.filter((ticket) => ticket.state === "open").length;
  const unknown = tickets.filter((ticket) => ticket.state === "unknown").length;
  const blocked = tickets.filter((ticket) => ticket.readiness === "blocked").length;
  const claimed = tickets.filter((ticket) => ticket.readiness === "claimed").length;
  const ready = tickets.filter((ticket) => ticket.readiness === "ready").length;
  return {
    name: deliveryEntity.title,
    path: deliveryPath,
    hasSpec: sourcesByPath.has(specPath),
    total: tickets.length,
    closed,
    open,
    unknown,
    blocked,
    claimed,
    ready,
    progress: progress(closed, tickets.length),
    specPath,
    tickets: tickets.map((ticket) => {
      const relations = relationsFrom.get(ticket.id) ?? [];
      return {
        id: ticket.id,
        title: ticket.title,
        state: ticket.state,
        owner: ticket.owner,
        readiness: ticket.readiness,
        deliveryType: ticket.deliveryType,
        dependencies: relations.filter(
          (relation) => relation.kind === "depends-on",
        ).length,
        path: ticket.id.replace(/^Ticket:/, ""),
      };
    }),
  };
}

function sectionLineCount(text, title) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start < 0) return 0;
  let count = 0;
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line.trim())) break;
    if (line.trim() && !line.trim().startsWith("<!--")) count += 1;
  }
  return count;
}

function progress(closed, total) {
  return total === 0 ? null : Math.round((closed / total) * 100);
}

function summarizeDiagnostics(diagnostics) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const diagnostic of diagnostics) {
    counts[diagnostic.severity] = (counts[diagnostic.severity] ?? 0) + 1;
  }
  return { counts, items: diagnostics.slice(0, 100) };
}

// 首页导读投影：项目身份 → 权威阅读路径 → 当前项目地图 → 语义演变 →
// 当前注意力 → 继续入口。可选来源缺失显示未配置，不显示零进度。
function buildOverview(index, context) {
  const {
    maps,
    deliveries,
    history,
    git,
    projectEntity,
    sourcesById,
    entitiesById,
    relationsFrom,
    entitySummaries,
  } = context;
  const readingPath = currentStateReadingPath(index, sourcesById);
  const attentionSource = index.sources.find(
    (source) => source.path === ".codestable/attention.md",
  );
  const decisions = entitySummaries.filter(
    (entity) => entity.kind === "Decision",
  );
  const tickets = entitySummaries.filter((entity) => entity.kind === "Ticket");
  const count = (list, predicate) => list.filter(predicate).length;
  const frontier = decisions.filter((decision) => decision.readiness === "frontier");
  const ready = tickets.filter((ticket) => ticket.readiness === "ready");
  const claimed = decisions.filter((decision) => decision.readiness === "claimed").length +
    tickets.filter((ticket) => ticket.readiness === "claimed").length;
  const blocked = decisions.filter((decision) => decision.readiness === "blocked").length +
    tickets.filter((ticket) => ticket.readiness === "blocked").length;
  const closed = count(decisions, (item) => item.state === "closed") +
    count(tickets, (item) => item.state === "closed");
  const scopes = currentStateScopes(index);
  const currentMap = buildCurrentMap(index, sourcesById);
  const historyEntries = recentHistoryEntries(index, relationsFrom, entitiesById);
  const attentionItems = buildAttentionItems(index, entitySummaries, git);
  const summary = projectSummary(sourcesById);

  return {
    identity: {
      name: projectEntity?.title ?? index.project.name,
      summary,
      root: ".",
      nameFallback: !index.project.hasArchitectureIndex,
      packages: scopes.filter((scope) => scope.startsWith("package:")),
      scopes,
      git: {
        available: git.available,
        branch: git.branch,
        changed: git.changed,
        changes: git.changes ?? [],
        state: git.state,
      },
      skillCount: entitySummaries.filter((entity) => entity.kind === "Skill").length,
    },
    readingPath,
    currentMap,
    maps: maps.map((map) => ({
      name: map.name,
      path: map.path,
      closed: map.closed,
      open: map.open,
      unknown: map.unknown,
      frontier: map.frontier,
      claimed: map.claimed,
      blocked: map.blocked,
      fog: map.fog,
      progress: map.progress,
      validity: map.validity,
    })),
    evolution: {
      entries: historyEntries,
      months: history.map((month) => ({
        name: month.name,
        path: month.path,
        entries: month.entries,
        invalid: month.invalid,
      })),
    },
    attention: {
      configured: Boolean(attentionSource),
      ...(attentionSource ? { summary: firstLines(attentionSource.content, 3) } : {}),
      items: attentionItems,
    },
    work: {
      decisions: decisions.length,
      tickets: tickets.length,
      frontier: frontier.length,
      ready: ready.length,
      claimed,
      blocked,
      closed,
    },
    continue: [
      ...frontier.map((item) => ({ id: item.id, kind: "Decision", title: item.title, reason: "当前前沿" })),
      ...ready.map((item) => ({ id: item.id, kind: "Ticket", title: item.title, reason: "Ready" })),
    ],
    hasWayfinding: maps.length > 0,
    hasDelivery: deliveries.length > 0,
    hasHistory: history.length > 0,
  };
}

const CURRENT_STATE_KINDS = new Set([
  "AttentionDocument",
  "ArchitectureIndex",
  "ArchitectureDocument",
  "RequirementIndex",
  "RequirementDocument",
  "ADR",
]);

const READING_REASONS = {
  AttentionDocument: "先确认每轮必读规则和当前注意力",
  ArchitectureIndex: "先了解范围地图、默认加载和公开边界",
  ArchitectureDocument: "再看包职责、依赖、公开边界和代码锚点",
  RequirementIndex: "补充领域作用域、通用语言和稳定规则",
  RequirementDocument: "读取当前领域边界及其稳定规则",
  ADR: "确认高代价架构决定及其替代关系",
};

const OVERVIEW_HISTORY_LIMIT = 5;

function projectSummary(sourcesById) {
  const architectureSummary = firstParagraph(
    sourcesById.get("source:.codestable/architecture/INDEX.md")?.content ?? "",
  );
  if (architectureSummary) return architectureSummary;

  const readmeParagraphs = paragraphBlocks(
    sourcesById.get("source:README.md")?.content ?? "",
  );
  return (
    readmeParagraphs.find((paragraph) => !/(Fork|上游|来源)/i.test(paragraph)) ??
    readmeParagraphs[0] ??
    ""
  );
}

function firstParagraph(text) {
  const lines = String(text).split("\n");
  const heading = lines.findIndex((line) => /^#\s+/.test(line.trim()));
  if (heading < 0) return paragraphBlocks(text)[0] ?? "";
  const body = lines.slice(heading + 1);
  const nextHeading = body.findIndex((line) => /^#{1,6}\s+/.test(line.trim()));
  return paragraphBlocks(body.slice(0, nextHeading < 0 ? body.length : nextHeading).join("\n"))[0] ?? "";
}

function paragraphBlocks(text) {
  const lines = String(text).split("\n");
  const paragraphs = [];
  let current = [];
  let fenced = false;
  const flush = () => {
    if (current.length > 0) {
      paragraphs.push(current.join(" ").trim());
      current = [];
    }
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      flush();
      fenced = !fenced;
      continue;
    }
    if (fenced || /^#{1,6}\s+/.test(trimmed) || !trimmed || trimmed.startsWith("<!--")) {
      flush();
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      flush();
      continue;
    }
    current.push(stripMarkdown(trimmed));
  }
  flush();
  return paragraphs.filter(Boolean);
}

function stripMarkdown(value) {
  return String(value)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_]/g, "")
    .trim();
}

function currentStateScopes(index) {
  return [...new Set(
    index.entities
      .filter((entity) => CURRENT_STATE_KINDS.has(entity.kind))
      .map((entity) => entity.scope)
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

function buildCurrentMap(index, sourcesById) {
  const entries = index.entities
    .filter((entity) => CURRENT_STATE_KINDS.has(entity.kind))
    .map((entity) => {
      const source = entity.source ? sourcesById.get(entity.source.id) : null;
      const scope = entity.scope ?? "";
      const packageScope = scope.startsWith("package:") ? scope : "";
      const contextScope = scope === "workspace" ||
        scope.startsWith("context:") ||
        scope.startsWith("shared:")
        ? scope
        : "";
      return {
        id: entity.id,
        title: entity.title,
        kind: entity.kind,
        path: source?.path ?? entity.source?.id?.replace(/^source:/, "") ?? "",
        scope,
        package: packageScope,
        context: contextScope,
        publicBoundary: sectionValues(source?.content ?? "", "公开边界"),
        codeAnchors: codeAnchorValues(source),
        validity: source?.validity ?? entity.validity,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const scopes = [...new Set(entries.map((entry) => entry.scope).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  const packages = [...new Set(entries.map((entry) => entry.package).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  const contexts = [...new Set(entries.map((entry) => entry.context).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  return {
    configured: entries.length > 0,
    scopes,
    packages,
    contexts,
    entries,
  };
}

function sectionValues(text, title) {
  const lines = String(text).split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start < 0) return [];
  const values = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (/^#{1,6}\s+/.test(trimmed)) break;
    if (!trimmed || trimmed.startsWith("<!--")) continue;
    values.push(stripMarkdown(trimmed.replace(/^[-*]\s+/, "")));
  }
  return values;
}

function codeAnchorValues(source) {
  if (!source) return [];
  const frontmatter = source.frontmatter["code-paths"]
    ? source.frontmatter["code-paths"].split("\n")
    : [];
  const section = sectionValues(source.content, "代码锚点");
  return [...new Set(
    [...frontmatter, ...section]
      .map((value) => stripMarkdown(value.replace(/^[-*]\s+/, "")))
      .filter(Boolean),
  )];
}

function recentHistoryEntries(index, relationsFrom, entitiesById) {
  return index.entities
    .filter((entity) => entity.kind === "HistoryEntry" && entity.validity === "valid")
    .sort((left, right) => {
      if (left.date !== right.date) return right.date.localeCompare(left.date);
      const leftPath = left.source?.id ?? "";
      const rightPath = right.source?.id ?? "";
      if (leftPath !== rightPath) return rightPath.localeCompare(leftPath);
      return (left.sourceOrder ?? 0) - (right.sourceOrder ?? 0);
    })
    .slice(0, OVERVIEW_HISTORY_LIMIT)
    .map((entry) => projectHistoryEntry(entry, relationsFrom, entitiesById));
}

function projectHistoryEntry(entry, relationsFrom, entitiesById) {
  const relations = relationsFrom.get(entry.id) ?? [];
  const basisRelations = relations.filter((relation) => relation.kind === "current-basis");
  const currentBasis = {
    raw: entry.currentBasis?.raw ?? "",
    items: (entry.currentBasis?.items ?? []).map((item) => {
      const relation = basisRelations.find(
        (candidate) =>
          candidate.provenance?.text === item.text ||
          candidate.originalTarget === item.href,
      );
      return {
        text: item.text,
        href: item.href,
        targetId: relation?.to ?? null,
        targetTitle: relation?.to ? entitiesById.get(relation.to)?.title ?? null : null,
        resolution: relation?.resolution ?? "unresolved",
      };
    }),
  };
  return {
    id: entry.id,
    date: entry.date,
    tag: entry.tag,
    result: entry.title,
    range: entry.range,
    reason: entry.reason,
    currentBasis,
    sourcePath: entry.source?.id?.replace(/^source:/, "") ?? null,
  };
}

function buildAttentionItems(index, entitySummaries, git) {
  const decisions = entitySummaries
    .filter((entity) => entity.kind === "Decision" && entity.readiness === "frontier")
    .sort((left, right) => left.id.localeCompare(right.id));
  const tickets = entitySummaries
    .filter(
      (entity) =>
        entity.kind === "Ticket" &&
        ["claimed", "ready", "blocked"].includes(entity.readiness),
    )
    .sort((left, right) => {
      const order = { claimed: 0, ready: 1, blocked: 2 };
      return (order[left.readiness] - order[right.readiness]) || left.id.localeCompare(right.id);
    });
  const items = [
    ...decisions.map((item) => ({
      kind: "Decision",
      id: item.id,
      targetId: item.id,
      title: item.title,
      path: item.path,
      status: "当前前沿",
      reason: "前置决策已关闭且未被认领",
      readiness: item.readiness,
    })),
    ...tickets.map((item) => ({
      kind: "Ticket",
      id: item.id,
      targetId: item.id,
      title: item.title,
      path: item.path,
      status: attentionTicketStatus(item.readiness),
      reason: attentionTicketReason(item),
      readiness: item.readiness,
      owner: item.owner ?? "",
    })),
    ...index.diagnostics.map((diagnostic) => {
      const target = index.entities.find(
        (entity) =>
          entity.id === diagnostic.source || entity.source?.id === diagnostic.source,
      );
      const path = diagnostic.location?.path ?? diagnostic.source?.replace(/^source:/, "") ?? "";
      return {
        kind: "Diagnostic",
        id: diagnostic.id,
        targetId: target?.id ?? null,
        title: target?.title ?? path,
        path,
        status: "未解决",
        reason: diagnostic.message,
        severity: diagnostic.severity,
      };
    }),
    ...(git.changes ?? []).map((change) => ({
      kind: "WorkspaceChange",
      id: `WorkspaceChange:${change.path}`,
      targetId: "GitRepository:git",
      title: change.path,
      path: change.path,
      status: change.reason,
      reason: `工作区存在未提交的${change.reason}变更`,
      rawStatus: change.status,
    })),
  ];
  return items;
}

function attentionTicketStatus(readiness) {
  if (readiness === "claimed") return "已认领";
  if (readiness === "blocked") return "被阻塞";
  return "Ready";
}

function attentionTicketReason(ticket) {
  if (ticket.readiness === "claimed") {
    return ticket.owner ? `已有认领者：${ticket.owner}` : "已有认领者";
  }
  if (ticket.readiness === "blocked") {
    return "存在未关闭或未解析的前置依赖";
  }
  return "前置工单已关闭且未被认领";
}

// 当前态资料入口顺序：注意力 → 架构索引 → 包/共享页 → 领域上下文 → 上下文/共享/ADR。
function currentStateReadingPath(index, sourcesById) {
  const order = [
    [".codestable/attention.md", "AttentionDocument"],
    [".codestable/architecture/INDEX.md", "ArchitectureIndex"],
    [".codestable/architecture/packages/", "ArchitectureDocument"],
    [".codestable/architecture/shared/", "ArchitectureDocument"],
    [".codestable/requirements/CONTEXT.md", "RequirementIndex"],
    [".codestable/requirements/contexts/", "RequirementDocument"],
    [".codestable/requirements/shared/", "RequirementDocument"],
    [".codestable/requirements/adrs/", "ADR"],
  ];
  const result = [];
  for (const [prefix, kind] of order) {
    const matches = index.entities
      .filter(
        (entity) =>
          entity.kind === kind && entity.source?.id.startsWith(`source:${prefix}`),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const entity of matches) {
      const source = sourcesById.get(entity.source.id);
      result.push({
        id: entity.id,
        kind: entity.kind,
        title: entity.title,
        path: entity.source.id.replace(/^source:/, ""),
        validity: source?.validity ?? entity.validity,
        scope: entity.scope,
        reason: READING_REASONS[entity.kind] ?? "补充当前态依据和定位入口",
      });
    }
  }
  return result;
}

function firstLines(text, count) {
  return text
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .slice(0, count)
    .join(" ");
}

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
  let git = { available: false, branch: "not a git repository", changed: 0, commit: "" };

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
  const { maps, deliveries, history, git, projectEntity, sourcesById, entitySummaries } = context;
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

  return {
    identity: {
      name: projectEntity?.title ?? index.project.name,
      git: { available: git.available, branch: git.branch, changed: git.changed, state: git.state },
      skillCount: entitySummaries.filter((entity) => entity.kind === "Skill").length,
    },
    readingPath,
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
      months: history.map((month) => ({
        name: month.name,
        path: month.path,
        entries: month.entries,
        invalid: month.invalid,
      })),
    },
    attention: attentionSource
      ? {
          configured: true,
          summary: firstLines(attentionSource.content, 3),
        }
      : { configured: false },
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

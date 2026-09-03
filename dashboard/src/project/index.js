// ProjectIndex 构建与稳定 ID。每次扫描构建一个只读、有类型的索引；
// 页面、API、搜索和图只消费其投影。

import { execFile } from "node:child_process";
import { basename, dirname, join, normalize, relative } from "node:path";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

import { firstHeading, unquote } from "./markdown.js";
import { enumerateMarkdownFiles, readSourceDocument } from "./sources.js";
import { DiagnosticCodes, DiagnosticCollector } from "./diagnostics.js";
import { buildRelations } from "./relations.js";

const execFileAsync = promisify(execFile);

export const SCHEMA_VERSION = 2;

const DECISION_STATES = new Map([
  ["打开", "open"],
  ["open", "open"],
  ["关闭", "closed"],
  ["closed", "closed"],
]);

const HISTORY_TAGS = new Set(["功能", "缺陷", "重构", "演进"]);
const TICKET_TYPES = new Set(["功能", "缺陷", "重构"]);

const CURRENT_STATE_RULES = [
  { pattern: /^\.codestable\/attention\.md$/, kind: "AttentionDocument" },
  { pattern: /^\.codestable\/architecture\/INDEX\.md$/, kind: "ArchitectureIndex" },
  { pattern: /^\.codestable\/architecture\/packages\/.*\.md$/, kind: "ArchitectureDocument" },
  { pattern: /^\.codestable\/architecture\/shared\/.*\.md$/, kind: "ArchitectureDocument" },
  { pattern: /^\.codestable\/requirements\/CONTEXT\.md$/, kind: "RequirementIndex" },
  { pattern: /^\.codestable\/requirements\/contexts\/.*\.md$/, kind: "RequirementDocument" },
  { pattern: /^\.codestable\/requirements\/shared\/.*\.md$/, kind: "RequirementDocument" },
];

// 构建完整 ProjectIndex。previous 提供按路径+修改时间复用的 SourceDocument 缓存。
export async function buildProjectIndex(projectRoot, previous) {
  const diagnostics = new DiagnosticCollector();

  const relativePaths = await enumerateMarkdownFiles(projectRoot);
  const previousSources = new Map(
    (previous?.sources ?? []).map((source) => [source.path, source]),
  );
  const sources = [];
  for (const relativePath of relativePaths) {
    const cached = previousSources.get(relativePath);
    if (cached && (await sourceUnchanged(projectRoot, relativePath, cached))) {
      sources.push(cached);
    } else {
      sources.push(await readSourceDocument(projectRoot, relativePath, diagnostics));
    }
  }

  const fileExists = new Set(relativePaths);
  const sourcesByPath = new Map(sources.map((source) => [source.path, source.id]));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));

  const git = await scanGit(projectRoot, diagnostics);

  const entities = [];
  const entitiesById = new Map();
  const entitiesByPath = new Map();
  const entityPaths = new Set();
  const addEntity = (entity) => {
    if (entityPaths.has(entity.id)) {
      diagnostics.error(
        DiagnosticCodes.DuplicateId,
        entity.source?.id ?? entity.id,
        { path: entity.source?.id?.replace(/^source:/, "") ?? entity.id },
        `重复实体 ID: ${entity.id}`,
      );
    }
    entityPaths.add(entity.id);
    entities.push(entity);
    entitiesById.set(entity.id, entity);
    return entity;
  };

  // ---- Project ----
  const architectureIndexPath = ".codestable/architecture/INDEX.md";
  const hasArchitectureIndex = sourcesByPath.has(architectureIndexPath);
  const hasRequirementsContext = sourcesByPath.has(
    ".codestable/requirements/CONTEXT.md",
  );
  let projectName;
  const directoryName = basename(projectRoot);
  if (hasArchitectureIndex) {
    const indexSource = sourcesById.get(sourcesByPath.get(architectureIndexPath));
    projectName = firstHeading(indexSource.content) ?? directoryName;
    if (projectName === directoryName) {
      diagnostics.info(
        "name-fallback",
        indexSource.id,
        { path: architectureIndexPath },
        "架构索引缺少一级标题，项目显示名回退到目录名",
      );
    }
  } else {
    projectName = directoryName;
  }
  addEntity({
    id: "Project:.",
    kind: "Project",
    title: projectName,
    source: null,
    authority: "environment",
    validity: "valid",
    sourceOrder: 0,
    hasArchitectureIndex,
    hasRequirementsContext,
  });

  // ---- Git 实体 ----
  const knownCommits = new Map();
  const gitRepositoryEntity = {
    id: "GitRepository:git",
    kind: "GitRepository",
    title: git.available ? `Git ${git.branch}` : "Git 不可用",
    source: null,
    authority: "environment",
    validity: git.available ? "valid" : "unavailable",
    sourceOrder: 0,
    state: git.state,
    branch: git.branch,
    changed: git.changed,
    changes: git.changes,
    headCommit: git.commit?.hash ?? null,
  };
  addEntity(gitRepositoryEntity);
  if (git.commit) {
    knownCommits.set(git.commit.hash, git.commit.hash);
    addEntity({
      id: `GitCommit:${git.commit.hash}`,
      kind: "GitCommit",
      title: git.commit.subject,
      source: null,
      authority: "evidence",
      validity: "valid",
      sourceOrder: 0,
      hash: git.commit.hash,
      subject: git.commit.subject,
      date: git.commit.date,
    });
  }

  // ---- 文档类实体（当前态 / 读者 / 技能）----
  for (const source of sources) {
    const rule = CURRENT_STATE_RULES.find((candidate) =>
      candidate.pattern.test(source.path),
    );
    if (rule) {
      const entity = documentEntity(source, rule.kind, "current-state");
      addEntity(entity);
      entitiesByPath.set(source.path, entity.id);
      continue;
    }
    if (source.category === "reader-document") {
      addEntity(documentEntity(source, "ReaderDocument", "reader-document"));
      entitiesByPath.set(source.path, entitiesById.get(`ReaderDocument:${source.path}`).id);
    } else if (source.category === "skill") {
      addEntity({
        id: `Skill:${source.path}`,
        kind: "Skill",
        title: unquote(source.frontmatter.name) || source.path,
        source: { id: source.id },
        authority: "environment",
        validity: "valid",
        sourceOrder: 0,
        name: unquote(source.frontmatter.name),
        description: unquote(source.frontmatter.description),
      });
      entitiesByPath.set(source.path, `Skill:${source.path}`);
    }
  }

  // ---- 工作状态实体：地图、决策、交付、规格、tickets ----
  for (const source of sources) {
    if (source.category !== "work-state") continue;
    if (/\/map\.md$/.test(source.path)) {
      addEntity({
        id: `DecisionMap:${source.path}`,
        kind: "DecisionMap",
        title: firstHeading(source.content) ?? source.path,
        source: { id: source.id },
        authority: "work-state",
        validity: "valid",
        sourceOrder: 0,
        scope: unquote(source.frontmatter.scope),
      });
      entitiesByPath.set(source.path, `DecisionMap:${source.path}`);
      continue;
    }
    if (/\/decisions\/.*\.md$/.test(source.path)) {
      const entity = decisionEntity(source, diagnostics);
      addEntity(entity);
      entitiesByPath.set(source.path, entity.id);
      continue;
    }
    if (/\/spec\.md$/.test(source.path)) {
      const entity = documentEntity(source, "Specification", "work-state");
      addEntity(entity);
      entitiesByPath.set(source.path, entity.id);
      continue;
    }
    if (/\/tickets\/.*\.md$/.test(source.path)) {
      const entity = ticketEntity(source, diagnostics);
      addEntity(entity);
      entitiesByPath.set(source.path, entity.id);
    }
  }

  // Delivery 目录实体（.wayfinding/<map>/delivery 与 .delivery/<name>）。
  const deliveryPaths = new Set();
  for (const path of sourcesByPath.keys()) {
    const match = path.match(/^(.*)\/spec\.md$/);
    if (match && (path.startsWith(".wayfinding/") || path.startsWith(".delivery/"))) {
      deliveryPaths.add(match[1]);
    }
  }
  for (const deliveryPath of [...deliveryPaths].sort()) {
    addEntity({
      id: `Delivery:${deliveryPath}`,
      kind: "Delivery",
      title: deliveryPath.split("/").at(-1) ?? deliveryPath,
      source: null,
      authority: "work-state",
      validity: "valid",
      sourceOrder: 0,
    });
  }

  // ---- 历史文档与条目 ----
  // 月文件本身也是可读资料；条目实体继续保留，分别服务目录和历史时间线。
  const historyEntries = [];
  for (const source of sources) {
    if (source.category !== "history") continue;
    const historyDocument = documentEntity(source, "HistoryDocument", "history");
    addEntity(historyDocument);
    entitiesByPath.set(source.path, historyDocument.id);
    historyEntries.push(...parseHistoryEntries(source, diagnostics));
  }
  for (const entry of historyEntries) addEntity(entry);

  // ---- 代码锚点实体 ----
  for (const anchor of collectCodeAnchorEntities(sources)) addEntity(anchor);

  // ---- 依赖解析（readiness 与 depends-on 关系共享）----
  const dependencyInfo = new Map();
  for (const entity of entities) {
    if (entity.kind !== "Decision" && entity.kind !== "Ticket") continue;
    const source = entity.source ? sourcesById.get(entity.source.id) : null;
    const rawDependencies = source?.frontmatter["硬依赖"];
    const dependencies = [];
    for (const target of splitDependencyList(rawDependencies)) {
      dependencies.push(
        resolveDependencyTarget(
          projectRoot,
          entity.id.replace(/^[^:]+:/, ""),
          target,
          sourcesByPath,
          entitiesByPath,
          fileExists,
          diagnostics,
          entity.id,
        ),
      );
    }
    dependencyInfo.set(entity.id, dependencies);
  }

  // 依赖目标状态回填：readiness 需要目标实体的 state。
  for (const [entityId, dependencies] of dependencyInfo) {
    for (const dependency of dependencies) {
      dependency.targetState =
        entitiesById.get(dependency.targetId)?.state ?? "unknown";
    }
  }

  for (const entity of entities) {
    if (entity.kind === "Decision") {
      entity.readiness = deriveReadiness(
        "Decision",
        entity.state,
        entity.owner,
        dependencyInfo.get(entity.id) ?? [],
      );
    } else if (entity.kind === "Ticket") {
      entity.readiness = deriveReadiness(
        "Ticket",
        entity.state,
        entity.owner,
        dependencyInfo.get(entity.id) ?? [],
      );
    }
  }

  // ---- Git evidence commit 验证 ----
  const evidenceReferences = new Set();
  for (const entry of historyEntries) {
    for (const item of entry.evidence?.items ?? []) {
      if (item.type === "commit") evidenceReferences.add(item.hash);
    }
  }
  if (git.available && evidenceReferences.size > 0) {
    for (const reference of evidenceReferences) {
      const fullHash = await resolveCommitHash(projectRoot, reference);
      if (!fullHash) continue;
      const normalized = fullHash.toLowerCase();
      knownCommits.set(reference, normalized);
      if (!entitiesById.has(`GitCommit:${normalized}`)) {
        addEntity({
          id: `GitCommit:${normalized}`,
          kind: "GitCommit",
          title: reference,
          source: null,
          authority: "evidence",
          validity: "valid",
          sourceOrder: 0,
          hash: normalized,
          subject: reference,
          date: null,
        });
      }
    }
  }

  const ctx = {
    projectRoot,
    sources,
    sourcesByPath,
    sourcesById,
    entities,
    entitiesById,
    entitiesByPath,
    fileExists,
    fileProbe: createFileProbe(projectRoot),
    diagnostics,
    git,
    knownCommits,
    dependencyInfo,
  };
  const relations = await buildRelations(ctx);

  return {
    schemaVersion: SCHEMA_VERSION,
    project: {
      root: projectRoot,
      name: projectName,
      hasArchitectureIndex,
      hasRequirementsContext,
    },
    sources,
    entities,
    relations,
    diagnostics: diagnostics.items,
    generatedAt: new Date().toISOString(),
  };
}

function documentEntity(source, kind, authority) {
  return {
    id: `${kind}:${source.path}`,
    kind,
    title: firstHeading(source.content) ?? source.path,
    source: { id: source.id },
    authority,
    validity: source.validity,
    sourceOrder: 0,
    scope: unquote(source.frontmatter.scope),
  };
}

function decisionEntity(source, diagnostics) {
  const stateValue = unquote(source.frontmatter["状态"]);
  const state = DECISION_STATES.get(stateValue) ?? "unknown";
  if (stateValue !== "" && state === "unknown") {
    diagnostics.error(
      DiagnosticCodes.UnknownEnum,
      source.id,
      { path: source.path },
      `未知的状态枚举: ${stateValue}（期望 打开|关闭）`,
    );
  } else if (stateValue === "") {
    diagnostics.warning(
      DiagnosticCodes.MissingField,
      source.id,
      { path: source.path },
      "缺少 frontmatter 字段: 状态",
    );
  }
  return {
    id: `Decision:${source.path}`,
    kind: "Decision",
    title: firstHeading(source.content) ?? source.path,
    source: { id: source.id },
    authority: "work-state",
    validity: state === "unknown" && stateValue !== "" ? "partial" : "valid",
    sourceOrder: 0,
    state,
    owner: unquote(source.frontmatter["认领者"]),
    approach: unquote(source.frontmatter["处理方式"]),
    scope: unquote(source.frontmatter.scope),
  };
}

function ticketEntity(source, diagnostics) {
  const stateValue = unquote(source.frontmatter["状态"]);
  const state = DECISION_STATES.get(stateValue) ?? "unknown";
  const typeValue = unquote(source.frontmatter["交付类型"]);
  if (stateValue !== "" && state === "unknown") {
    diagnostics.error(
      DiagnosticCodes.UnknownEnum,
      source.id,
      { path: source.path },
      `未知的状态枚举: ${stateValue}（期望 打开|关闭）`,
    );
  } else if (stateValue === "") {
    diagnostics.warning(
      DiagnosticCodes.MissingField,
      source.id,
      { path: source.path },
      "缺少 frontmatter 字段: 状态",
    );
  }
  if (typeValue !== "" && !TICKET_TYPES.has(typeValue)) {
    diagnostics.warning(
      DiagnosticCodes.UnknownEnum,
      source.id,
      { path: source.path },
      `未知的交付类型: ${typeValue}（期望 功能|缺陷|重构）`,
    );
  }
  return {
    id: `Ticket:${source.path}`,
    kind: "Ticket",
    title: firstHeading(source.content) ?? source.path,
    source: { id: source.id },
    authority: "work-state",
    validity: state === "unknown" && stateValue !== "" ? "partial" : "valid",
    sourceOrder: 0,
    state,
    owner: unquote(source.frontmatter["认领者"]),
    deliveryType: typeValue,
    scope: unquote(source.frontmatter.scope),
  };
}

function deriveReadiness(kind, state, owner, dependencies) {
  if (state === "unknown") return "unknown";
  if (state === "closed") return "none";
  if (owner) return "claimed";
  for (const dependency of dependencies) {
    if (dependency.resolution !== "resolved") return "blocked";
    if (dependency.targetState !== "closed") return "blocked";
  }
  return kind === "Decision" ? "frontier" : "ready";
}

function resolveDependencyTarget(
  projectRoot,
  fromPath,
  target,
  sourcesByPath,
  entitiesByPath,
  fileExists,
  diagnostics,
  entityId,
) {
  const trimmed = target.trim();
  const unsafe = (message) => {
    diagnostics.error(
      DiagnosticCodes.PathEscape,
      entityId,
      { path: fromPath },
      message,
      trimmed,
    );
    return {
      targetId: null,
      resolution: "unsafe",
      originalTarget: trimmed,
      targetState: null,
    };
  };
  if (
    /^(https?:|mailto:|ftp:|data:)/i.test(trimmed) ||
    trimmed.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith("#")
  ) {
    return unsafe(`硬依赖越界或不安全路径: ${trimmed}`);
  }
  const absFrom = join(projectRoot, ...fromPath.split("/"));
  const absTarget = normalize(join(dirname(absFrom), ...trimmed.split("/")));
  const rel = relative(projectRoot, absTarget);
  if (rel.startsWith("..") || rel === "") {
    return unsafe(`硬依赖越界或不安全路径: ${trimmed}`);
  }
  const targetPath = rel.replace(/\\/g, "/");
  const targetEntity = entitiesByPath.get(targetPath);
  if (targetEntity) {
    return {
      targetId: targetEntity,
      resolution: "resolved",
      targetPath,
      targetState: null,
    };
  }
  if (fileExists.has(targetPath) || sourcesByPath.has(targetPath)) {
    return {
      targetId: sourcesByPath.get(targetPath) ?? `file:${targetPath}`,
      resolution: "resolved",
      targetPath,
      targetState: null,
    };
  }
  diagnostics.error(
    DiagnosticCodes.MissingDependency,
    entityId,
    { path: fromPath },
    `硬依赖目标不存在或无法解析: ${trimmed}`,
    trimmed,
  );
  return {
    targetId: null,
    resolution: "unresolved",
    originalTarget: trimmed,
    targetState: null,
  };
}

// ---- 历史条目解析 ----

function parseHistoryEntries(source, diagnostics) {
  const lines = source.content.split("\n");
  const rawEntries = [];
  let current = null;
  const finalize = (entry) => {
    rawEntries.push(entry);
    current = null;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^- (\d{4}-\d{2}-\d{2})\s*[·•]/);
    if (match) {
      if (current) finalize(current);
      current = { startLine: index + 1, date: match[1], lines: [line] };
    } else if (current && line.trim()) {
      current.lines.push(line);
    }
  }
  if (current) finalize(current);

  const byDate = new Map();
  const entries = [];
  for (const raw of rawEntries) {
    const sequence = (byDate.get(raw.date) ?? 0) + 1;
    byDate.set(raw.date, sequence);
    const entry = parseHistoryEntry(source, raw, sequence, diagnostics);
    if (entry) entries.push(entry);
  }
  return entries;
}

function parseHistoryEntry(source, raw, sequence, diagnostics) {
  const first = raw.lines[0];
  const match = first.match(
    /^- (\d{4}-\d{2}-\d{2})\s*[·•]\s*\[([^\]]+)\]\s*(.+)/,
  );
  const fields = { 范围: "", 原因: "", 当前依据: "", 证据: "" };
  let result = "";
  if (match) {
    result = match[3].trim();
    const rangeMatch = result.match(/范围：(.*)/);
    if (rangeMatch) {
      fields["范围"] = rangeMatch[1].trim();
      result = result.replace(/范围：.*$/, "").trim();
    }
  }
  for (const line of raw.lines.slice(1)) {
    const fieldMatch = line.trim().match(/^(范围|原因|当前依据|证据)：(.*)/);
    if (fieldMatch) {
      fields[fieldMatch[1]] = fieldMatch[2].trim();
    }
  }
  const tag = match?.[2]?.trim() ?? "";

  if (!match) {
    diagnostics.warning(
      DiagnosticCodes.HistoryFormat,
      source.id,
      { path: source.path, line: raw.startLine },
      `历史条目格式无法解析: ${first.slice(0, 80)}`,
    );
    return null;
  }
  if (!HISTORY_TAGS.has(tag)) {
    diagnostics.warning(
      DiagnosticCodes.HistoryFormat,
      source.id,
      { path: source.path, line: raw.startLine },
      `历史条目标签无效: ${tag}（期望 功能|缺陷|重构|演进）`,
    );
    return null;
  }
  const complete =
    result !== "" &&
    fields["范围"] !== "" &&
    fields["原因"] !== "" &&
    fields["当前依据"] !== "" &&
    fields["证据"] !== "";
  if (!complete) {
    diagnostics.warning(
      DiagnosticCodes.HistoryFormat,
      source.id,
      { path: source.path, line: raw.startLine },
      `历史条目缺少必填字段（范围/原因/当前依据/证据）: ${first.slice(0, 80)}`,
    );
    return null;
  }

  return {
    id: `HistoryEntry:${source.path}:${raw.date}:${sequence}`,
    kind: "HistoryEntry",
    title: result,
    source: { id: source.id, field: "条目", entry: sequence },
    authority: "history",
    validity: "valid",
    sourceOrder: sequence,
    date: raw.date,
    tag,
    range: fields["范围"],
    reason: fields["原因"],
    currentBasis: parseTextTargets(fields["当前依据"]),
    evidence: parseEvidence(fields["证据"]),
    startLine: raw.startLine,
  };
}

// 当前依据文本：提取 Markdown 链接与可定位路径片段。
function parseTextTargets(text) {
  const items = [];
  const linkPattern = /\[([^\]]*)\]\(([^)\s]+)\)/g;
  let rest = text;
  for (const match of text.matchAll(linkPattern)) {
    items.push({ text: match[1] || match[2], href: match[2] });
    rest = rest.replace(match[0], "");
  }
  for (const part of rest.split(/[、，,;；。]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (/[/\\]/.test(trimmed) || /\.md$/.test(trimmed)) {
      items.push({ text: trimmed, href: trimmed });
    }
  }
  return { raw: text, items };
}

function parseEvidence(text) {
  const items = [];
  for (const part of text.split(/[、，,;；。]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const commitMatch = trimmed.match(/^提交\s*`?([0-9a-fA-F]{7,40})`?/);
    if (commitMatch) {
      items.push({
        type: "commit",
        text: trimmed,
        hash: commitMatch[1].toLowerCase(),
      });
      continue;
    }
    if (/^Pi\s*会话/.test(trimmed)) {
      items.push({ type: "external", text: trimmed });
      continue;
    }
    const pathMatch = trimmed.match(/`([^`]+)`/);
    const candidate = pathMatch?.[1] ?? trimmed;
    if (/[/\\]/.test(candidate) || /\.md$/.test(candidate)) {
      items.push({
        type: "path",
        text: trimmed,
        href: candidate.replace(/^`|`$/g, ""),
      });
    }
  }
  return { raw: text, items };
}

// ---- 代码锚点实体 ----

function collectCodeAnchorEntities(sources) {
  const anchors = new Map();
  for (const source of sources) {
    if (source.category !== "current-state") continue;
    const lines = [];
    const codePaths = source.frontmatter["code-paths"];
    if (codePaths) {
      for (const line of codePaths.split("\n")) {
        lines.push(line.trim());
      }
    }
    lines.push(...codeAnchorSection(source.content));
    for (const line of lines) {
      const symbol = line.replace(/^[-*]\s*/, "").replace(/`/g, "").trim();
      if (!symbol) continue;
      const anchorId = `CodeAnchor:${symbol}`;
      if (!anchors.has(anchorId)) {
        anchors.set(anchorId, {
          id: anchorId,
          kind: "CodeAnchor",
          title: symbol,
          source: { id: source.id },
          authority: "current-state",
          validity: "valid",
          sourceOrder: 0,
          symbol,
        });
      }
    }
  }
  return [...anchors.values()];
}

function codeAnchorSection(body) {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim() === "## 代码锚点");
  if (start < 0) return [];
  const result = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line.trim())) break;
    const text = line.trim();
    if (text.startsWith("<!--")) continue;
    if (text.startsWith("- ")) result.push(text.slice(2));
  }
  return result;
}

// ---- Git ----

async function scanGit(projectRoot, diagnostics) {
  try {
    const [{ stdout: status }, { stdout: log }] = await Promise.all([
      execFileAsync("git", ["status", "--porcelain=v1", "--branch"], {
        cwd: projectRoot,
        timeout: 2000,
      }),
      execFileAsync(
        "git",
        ["log", "-1", "--pretty=format:%H%n%h%n%ad%n%s", "--date=short"],
        { cwd: projectRoot, timeout: 2000 },
      ),
    ]);
    const lines = status.trimEnd().split("\n");
    const branch = lines[0]?.replace(/^## /, "").split("...")[0] ?? "unknown";
    const changes = lines
      .filter((line) => line && !line.startsWith("## "))
      .map(parseGitStatusLine);
    const logLines = log.trim().split("\n");
    const commit = logLines[0]
      ? {
          hash: logLines[0],
          short: logLines[1] ?? "",
          date: logLines[2] ?? "",
          subject: logLines.slice(3).join(" "),
        }
      : null;
    return {
      available: true,
      state: changes.length > 0 ? "changed" : "clean",
      branch,
      changed: changes.length,
      changes,
      commit,
    };
  } catch {
    diagnostics.error(
      DiagnosticCodes.GitUnavailable,
      "GitRepository:git",
      { path: "git" },
      "Git 不可用或命令失败",
    );
    return {
      available: false,
      state: "unavailable",
      branch: "not a git repository",
      changed: 0,
      changes: [],
      commit: null,
    };
  }
}

export async function resolveCommitHash(projectRoot, reference) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--verify", `${reference}^{commit}`],
      { cwd: projectRoot, timeout: 2000 },
    );
    return stdout.trim().toLowerCase();
  } catch {
    return null;
  }
}

function parseGitStatusLine(line) {
  const status = line.slice(0, 2).trim() || "??";
  const rawPath = line.slice(3).trim();
  const path = rawPath.includes(" -> ")
    ? rawPath.slice(rawPath.lastIndexOf(" -> ") + 4)
    : rawPath;
  return {
    path: path.replace(/\\/g, "/"),
    status,
    reason: gitChangeReason(status),
  };
}

function gitChangeReason(status) {
  if (status === "??") return "未跟踪";
  if (status.includes("U")) return "存在冲突";
  if (status.includes("D")) return "已删除";
  if (status.includes("R")) return "已重命名";
  if (status.includes("A")) return "已新增";
  return "已修改";
}

// ---- 工具 ----

async function sourceUnchanged(projectRoot, relativePath, cached) {
  try {
    const metadata = await stat(join(projectRoot, ...relativePath.split("/")));
    const cachedTime = Date.parse(cached.modifiedAt);
    return (
      metadata.size === cached.size &&
      Math.abs(metadata.mtimeMs - cachedTime) < 1
    );
  } catch {
    return false;
  }
}

// 非 Markdown 目标的存在性探测（带缓存，避免重复 stat）。
function createFileProbe(projectRoot) {
  const cache = new Map();
  return async (relativePath) => {
    if (cache.has(relativePath)) return cache.get(relativePath);
    let result = false;
    try {
      await stat(join(projectRoot, ...relativePath.split("/")));
      result = true;
    } catch {
      result = false;
    }
    cache.set(relativePath, result);
    return result;
  };
}

function splitDependencyList(value) {
  if (value == null) return [];
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  const result = [];
  for (const line of lines) {
    if (line.startsWith("[")) {
      const inner = line.slice(1, line.endsWith("]") ? -1 : undefined);
      result.push(
        ...inner
          .split(",")
          .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
          .filter(Boolean),
      );
    } else {
      result.push(line);
    }
  }
  return result;
}

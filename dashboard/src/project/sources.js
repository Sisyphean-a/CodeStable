// 受支持资料的安全枚举、读取与 SourceDocument 缓存。
// 每个仓库文件只解析一次；未被受支持位置命中的 Markdown 归为 unindexed。

import { access, readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

import { extractHeadings, parseFrontmatterFields, splitFrontmatter } from "./markdown.js";
import { DiagnosticCodes } from "./diagnostics.js";

export const CATEGORY_CURRENT_STATE = "current-state";
export const CATEGORY_WORK_STATE = "work-state";
export const CATEGORY_HISTORY = "history";
export const CATEGORY_READER = "reader-document";
export const CATEGORY_SKILL = "skill";
export const CATEGORY_UNINDEXED = "unindexed";

// 受支持资料的位置契约。越早匹配的规则优先；均不命中则归为 unindexed。
const SUPPORTED_RULES = [
  { pattern: /^\.codestable\/attention\.md$/, category: CATEGORY_CURRENT_STATE },
  { pattern: /^\.codestable\/architecture\/INDEX\.md$/, category: CATEGORY_CURRENT_STATE },
  { pattern: /^\.codestable\/architecture\/packages\/.*\.md$/, category: CATEGORY_CURRENT_STATE },
  { pattern: /^\.codestable\/architecture\/shared\/.*\.md$/, category: CATEGORY_CURRENT_STATE },
  { pattern: /^\.codestable\/requirements\/CONTEXT\.md$/, category: CATEGORY_CURRENT_STATE },
  { pattern: /^\.codestable\/requirements\/contexts\/.*\.md$/, category: CATEGORY_CURRENT_STATE },
  { pattern: /^\.codestable\/requirements\/shared\/.*\.md$/, category: CATEGORY_CURRENT_STATE },
  { pattern: /^\.codestable\/history\/.*\.md$/, category: CATEGORY_HISTORY },
  { pattern: /^\.wayfinding\/[^/]+\/map\.md$/, category: CATEGORY_WORK_STATE },
  { pattern: /^\.wayfinding\/[^/]+\/decisions\/.*\.md$/, category: CATEGORY_WORK_STATE },
  { pattern: /^\.wayfinding\/[^/]+\/delivery\/spec\.md$/, category: CATEGORY_WORK_STATE },
  { pattern: /^\.wayfinding\/[^/]+\/delivery\/tickets\/.*\.md$/, category: CATEGORY_WORK_STATE },
  { pattern: /^\.delivery\/[^/]+\/spec\.md$/, category: CATEGORY_WORK_STATE },
  { pattern: /^\.delivery\/[^/]+\/tickets\/.*\.md$/, category: CATEGORY_WORK_STATE },
  { pattern: /^README\.md$/, category: CATEGORY_READER },
  { pattern: /^skills\/[^/]+\/SKILL\.md$/, category: CATEGORY_SKILL },
];

// 枚举时跳过的目录（仓库边界之外或非资料）。
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".tmp",
  ".codegraph",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

export function categoryForPath(relativePath) {
  for (const rule of SUPPORTED_RULES) {
    if (rule.pattern.test(relativePath)) return rule.category;
  }
  return CATEGORY_UNINDEXED;
}

// 返回仓库内所有 .md 文件的相对 POSIX 路径。
export async function enumerateMarkdownFiles(projectRoot) {
  const paths = [];
  await walk(projectRoot, projectRoot, paths);
  return paths;
}

async function walk(projectRoot, directory, paths) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      await walk(projectRoot, absolute, paths);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      paths.push(relative(projectRoot, absolute).replace(/\\/g, "/"));
    }
  }
}

// 读取并解析单个 SourceDocument。读取失败返回 unavailable source 与诊断。
export async function readSourceDocument(projectRoot, relativePath, diagnostics) {
  const absolute = join(projectRoot, ...relativePath.split("/"));
  const sourceId = `source:${relativePath}`;
  let text;
  try {
    const [content, metadata] = await Promise.all([
      readFile(absolute, "utf8"),
      stat(absolute),
    ]);
    text = content;
    const { frontmatter, body } = splitFrontmatter(text);
    return {
      id: sourceId,
      path: relativePath,
      category: categoryForPath(relativePath),
      frontmatter: parseFrontmatterFields(frontmatter),
      headings: extractHeadings(body),
      content: body,
      raw: text,
      validity: "valid",
      modifiedAt: new Date(metadata.mtimeMs).toISOString(),
    };
  } catch (error) {
    diagnostics.error(
      DiagnosticCodes.ReadFailed,
      sourceId,
      { path: relativePath },
      `读取资料失败: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      id: sourceId,
      path: relativePath,
      category: categoryForPath(relativePath),
      frontmatter: {},
      headings: [],
      content: "",
      raw: "",
      validity: "unavailable",
      modifiedAt: null,
    };
  }
}

export async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// Markdown 文本解析：frontmatter、标题、锚点与显式链接。
// 本模块只做文本结构解析，不渲染 HTML（渲染在阅读工单中由 markdown-it 承担）。

const FRONTMATTER_PATTERN = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

export function splitFrontmatter(text) {
  const match = text.match(FRONTMATTER_PATTERN);
  if (!match) return { frontmatter: null, body: text };
  return { frontmatter: match[1], body: text.slice(match[0].length) };
}

export function unquote(value) {
  if (value == null) return "";
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

// 解析 frontmatter 键值。值支持内联标量、`[...]` 内联列表和后续 `- item` 行列表；
// 列表统一以 "\n" 连接的字符串行保存（保留原始顺序与原文）。
export function parseFrontmatterFields(frontmatterText) {
  const fields = {};
  if (frontmatterText == null) return fields;

  let currentKey = null;
  let currentList = null;
  for (const rawLine of frontmatterText.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const keyMatch = line.match(
      /^([A-Za-z\u4e00-\u9fff][\w\u4e00-\u9fff-]*):\s*(.*)$/,
    );
    if (keyMatch) {
      currentKey = keyMatch[1];
      currentList = null;
      const value = keyMatch[2].trim();
      if (value === "") {
        currentList = [];
        fields[currentKey] = "";
      } else {
        fields[currentKey] = unquote(value);
      }
      continue;
    }
    if (currentKey == null) continue;
    if (/^-\s+/.test(line)) {
      if (currentList == null) currentList = [];
      currentList.push(unquote(line.replace(/^-\s+/, "")));
      fields[currentKey] = currentList.join("\n");
    }
  }
  return fields;
}

// 显式列表字段 `[a, b]` 拆分为数组；非列表值返回 null。
export function parseInlineList(value) {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((part) => unquote(part))
    .filter(Boolean);
}

export function extractHeadings(body) {
  const headings = [];
  const seen = new Map();
  for (const line of body.split("\n")) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const text = match[2].trim();
    const anchor = anchorFor(text, seen);
    headings.push({ level: match[1].length, text, anchor });
  }
  return headings;
}

function anchorFor(text, seen) {
  const base = slugify(text);
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

// 提取显式 Markdown 链接 `[text](target)` 及其出现行号（1 起始）。
export function extractLinks(body) {
  const links = [];
  const lines = body.split("\n");
  const pattern = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const match of line.matchAll(pattern)) {
      links.push({ text: match[1], href: match[2], line: index + 1 });
    }
  }
  return links;
}

export function firstHeading(body) {
  const match = body.match(/^#\s+(.+?)\s*$/m);
  return match?.[1]?.trim();
}

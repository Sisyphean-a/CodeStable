// 同源静态资源服务：只从 src/web/ 提供文件，拒绝路径穿越，
// 响应带明确 MIME、nosniff 与同源 CSP。

import { readFile } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "web",
);

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
]);

// 安全响应头：nosniff、同源 CSP、无 store 缓存。
export function securityHeaders() {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; " +
      "connect-src 'self'; img-src 'self' data:; base-uri 'self'; " +
      "form-action 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

export const indexHtml = readFile(join(WEB_ROOT, "index.html"), "utf8");

// 解析 /assets/<name> 请求。返回 null 表示越界或未知类型。
// 只允许 WEB_ROOT 内的文件；URL 解码后规范化，防止 `..` 逃逸。
export function resolveAsset(requestPath) {
  const name = decodeURIComponent(requestPath.replace(/^\/assets\//, ""));
  if (!name || name.includes("\0")) return null;
  const absolute = resolve(WEB_ROOT, name);
  const relativePath = relative(WEB_ROOT, absolute);
  if (relativePath.startsWith("..") || relativePath === "") return null;
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!MIME_TYPES.has(extension)) return null;
  const normalized = normalize(absolute);
  if (!normalized.startsWith(normalize(WEB_ROOT))) return null;
  return { path: normalized, contentType: MIME_TYPES.get(extension) };
}

export async function readAsset(path) {
  return readFile(path, "utf8");
}

// 客户端共享工具：HTML 转义、实体链接与状态徽标（纯函数，可在 Node 中测试）。

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&#39;";
  });
}

// 稳定实体 ID 进入 URL；阅读状态由 entity 参数承载。
export function entityLink(entityId, text) {
  const href = `?view=reader&entity=${encodeURIComponent(entityId)}`;
  return `<a class="entity-link" href="${href}" data-entity="${escapeHtml(entityId)}">${escapeHtml(text ?? entityId)}</a>`;
}

export function pathLink(path, text) {
  const href = `?view=reader&entity=${encodeURIComponent(`source:${path}`)}`;
  return `<a class="path-link" href="${href}">${escapeHtml(text ?? path)}</a>`;
}

export function pill(text, tone = "neutral") {
  return `<span class="pill pill-${tone}">${escapeHtml(text)}</span>`;
}

export function emptyState(text) {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}

export function sectionTitle(text) {
  return `<h2>${escapeHtml(text)}</h2>`;
}

export function unconfigured(name) {
  return `<p class="empty">${escapeHtml(name)}：未配置/无资料</p>`;
}

// decision/ticket 生命周期文字与色调。
export function lifecycleTone(kind, state, readiness) {
  if (state === "closed") return { text: "已关闭", tone: "neutral" };
  if (state === "unknown") return { text: "未知", tone: "danger" };
  if (readiness === "claimed") return { text: "已认领", tone: "warn" };
  if (readiness === "blocked") return { text: "被阻塞", tone: "danger" };
  if (readiness === "frontier") return { text: "当前前沿", tone: "ok" };
  if (readiness === "ready") return { text: "Ready", tone: "ok" };
  if (readiness === "unknown") return { text: "未知", tone: "danger" };
  return { text: "打开", tone: "neutral" };
}

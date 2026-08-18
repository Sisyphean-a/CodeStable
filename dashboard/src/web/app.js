// 工作台应用：History API 路由（view/entity/query/filters/depth）、
// SSE 局部刷新与视图分发。刷新与浏览器历史不丢失共享状态；
// SSE 触发局部重取和重绘，从不整页 reload。
// 顶层不访问 DOM，parseUrl/buildUrl 可在 Node 中直接测试。

import { renderOverview } from "./views/overview.js";
import { renderState } from "./views/state.js";
import { renderWayfinding } from "./views/wayfinding.js";
import { renderDelivery } from "./views/delivery.js";
import { renderHistory } from "./views/history.js";
import { renderDocuments } from "./views/documents.js";
import { renderRelations } from "./views/relations.js";
import { renderReader } from "./views/reader.js";

export const VIEWS = {
  overview: renderOverview,
  state: renderState,
  wayfinding: renderWayfinding,
  delivery: renderDelivery,
  history: renderHistory,
  documents: renderDocuments,
  relations: renderRelations,
  reader: renderReader,
};

const DEFAULT_VIEW = "overview";

// URL 状态：view / entity / query / filters / depth（+ 视图专属 theme/historyFilters/unindexed）。
export function parseUrl(search) {
  const params = new URLSearchParams(search);
  const view = params.get("view") ?? DEFAULT_VIEW;
  return {
    view: Object.hasOwn(VIEWS, view) ? view : DEFAULT_VIEW,
    entity: params.get("entity") ?? "",
    query: params.get("query") ?? "",
    filters: params.get("filters") ?? "",
    depth: params.get("depth") ?? "",
    theme: params.get("theme") ?? "",
    historyFilters: params.get("historyFilters") ?? "",
    unindexed: params.get("unindexed") ?? "",
  };
}

export function buildUrl(urlState) {
  const params = new URLSearchParams();
  if (urlState.view !== DEFAULT_VIEW) params.set("view", urlState.view);
  if (urlState.entity) params.set("entity", urlState.entity);
  if (urlState.query) params.set("query", urlState.query);
  if (urlState.filters) params.set("filters", urlState.filters);
  if (urlState.depth) params.set("depth", urlState.depth);
  if (urlState.theme) params.set("theme", urlState.theme);
  if (urlState.historyFilters) params.set("historyFilters", urlState.historyFilters);
  if (urlState.unindexed) params.set("unindexed", urlState.unindexed);
  const search = params.toString();
  return search ? `?${search}` : "?view=overview";
}

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&#39;";
  });
}

// ---- 浏览器运行时（boot 前不触碰 DOM）----

export function createWorkbench(dom) {
  // window.fetch 必须以 window 为 this 调用（否则 Illegal invocation）。
  const fetchApi =
    typeof dom.fetch === "function" ? dom.fetch.bind(dom.window) : dom.fetch;
  const app = dom.document.querySelector("#app");
  const snapshotState = dom.document.querySelector("#snapshot-state");
  const nav = dom.document.querySelector("#nav");
  const navToggle = dom.document.querySelector("#nav-toggle");

  let snapshot = null;
  let urlState = parseUrl(dom.window.location.search);
  let scrollY = 0;
  let loadError = null;
  let readerDetail = null;
  let readerLoadError = null;
  let inspectorOpen = false;
  let inspectorTrigger = null;
  let searchResult = null;
  let searchError = false;
  let historyData = null;
  let historyError = false;
  let graphData = null;
  let graphError = false;
  let relationData = null;
  let relationError = null;

  let navigationDrawerOpen = false;
  let navigationTrigger = null;

  function navigationFocusables() {
    if (!nav) return [];
    return [...nav.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )];
  }

  function scheduleNavigationFocus(callback) {
    if (typeof dom.window.setTimeout === "function") {
      dom.window.setTimeout(callback, 0);
    } else {
      setTimeout(callback, 0);
    }
  }

  function setNavigationDrawer(open) {
    if (!nav || !navToggle) return;
    navigationDrawerOpen = open;
    nav.classList.toggle("is-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "关闭导航" : "打开导航");
    if (open) {
      navigationTrigger = navToggle;
      const firstLink = nav.querySelector("a[href]");
      const focusFirstLink = () => {
        if (navigationDrawerOpen) firstLink?.focus();
      };
      scheduleNavigationFocus(focusFirstLink);
    } else {
      navigationTrigger?.focus();
      scheduleNavigationFocus(() => {
        if (!navigationDrawerOpen) navigationTrigger?.focus();
      });
    }
  }

  function handleNavigationKeydown(event) {
    if (!navigationDrawerOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setNavigationDrawer(false);
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = navigationFocusables();
    if (focusable.length === 0) {
      event.preventDefault();
      navToggle?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && dom.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && dom.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function bindNavigationDrawer() {
    if (!nav || !navToggle) return;
    navToggle.addEventListener("click", () => {
      setNavigationDrawer(!navigationDrawerOpen);
    });
    navToggle.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      navToggle.click();
    });
    dom.document.addEventListener("keydown", handleNavigationKeydown);
  }

  bindNavigationDrawer();

  // 快照加载失败：显示原因与重试入口，不崩溃、不静默。
  function renderLoadFailure() {
    const detail = loadError
      ? `<p class="empty">${escapeAttribute(loadError)}</p>`
      : "";
    return `<section class="identity">
      <h1>无法加载项目快照</h1>
      <p class="empty">服务可能仍在启动，或快照请求失败。刷新页面或点击重试。</p>
      ${detail}
      <p><button type="button" class="action-link" id="retry-boot">重试</button></p>
    </section>`;
  }

  function bindRetryAction() {
    const retry = dom.document.querySelector("#retry-boot");
    retry?.addEventListener("click", () => boot());
  }

  function render() {
    if (snapshot === null) {
      app.innerHTML = renderLoadFailure();
      updateNavigation();
      updateSnapshotState();
      bindRetryAction();
      return;
    }
    const view = VIEWS[urlState.view];
    const previousScroll = dom.window.scrollY;
    if (urlState.view === "reader") {
      app.innerHTML = renderReader(snapshot, urlState, readerDetail, readerLoadError);
      restoreInspector();
    } else if (urlState.view === "documents") {
      app.innerHTML = renderDocuments(snapshot, urlState, searchResult);
      bindDocumentsActions();
    } else if (urlState.view === "history") {
      app.innerHTML = renderHistory(snapshot, urlState, historyData);
      bindHistoryActions();
    } else if (urlState.view === "wayfinding") {
      app.innerHTML = renderWayfinding(snapshot, urlState, graphData);
    } else if (urlState.view === "delivery") {
      app.innerHTML = renderDelivery(snapshot, urlState, graphData);
    } else if (urlState.view === "relations") {
      app.innerHTML = renderRelations(snapshot, urlState, relationData, relationError);
      bindRelationsActions();
    } else {
      app.innerHTML = view(snapshot, urlState);
    }
    dom.document.title = `${snapshot?.overview?.identity?.name ?? "CodeStable"} · 项目全景`;
    dom.window.scrollTo(0, previousScroll || scrollY);
    updateNavigation();
    updateSnapshotState();
  }

  // 阅读页交互：检查器开关（焦点进入/返回）、复制路径。
  function bindReaderActions() {
    const toggle = dom.document.querySelector("#inspector-toggle");
    const inspector = dom.document.querySelector("#inspector");
    if (toggle && inspector) {
      inspectorTrigger = toggle;
      toggle.addEventListener("click", () => {
        inspectorOpen = !inspectorOpen;
        if (inspectorOpen) {
          inspector.hidden = false;
          toggle.setAttribute("aria-expanded", "true");
          inspector.focus();
        } else {
          inspector.hidden = true;
          toggle.setAttribute("aria-expanded", "false");
          toggle.focus();
        }
      });
      inspector.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          inspectorOpen = false;
          inspector.hidden = true;
          toggle.setAttribute("aria-expanded", "false");
          toggle.focus();
        }
      });
    }
    const copyButton = dom.document.querySelector("#copy-path");
    if (copyButton) {
      copyButton.addEventListener("click", async () => {
        const path = copyButton.dataset.path ?? "";
        try {
          await dom.navigator.clipboard.writeText(path);
          copyButton.textContent = "已复制";
        } catch {
          copyButton.textContent = "复制失败";
        }
        setTimeout(() => {
          copyButton.textContent = "复制路径";
        }, 1200);
      });
    }
  }

  function restoreInspector() {
    const inspector = dom.document.querySelector("#inspector");
    const toggle = dom.document.querySelector("#inspector-toggle");
    if (inspector && toggle) {
      if (inspectorOpen) {
        inspector.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
      } else {
        inspector.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      }
    }
  }

  // 文档搜索：表单提交与筛选变化写入 URL 并重新查询。
  function bindDocumentsActions() {
    const form = dom.document.querySelector("#search-form");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = form.querySelector("#search-input");
      const query = input?.value.trim() ?? "";
      const filters = collectFilters(form);
      const unindexed = form.querySelector('input[name="unindexed"]')?.checked ? "1" : "";
      scrollY = dom.window.scrollY;
      urlState = {
        ...urlState,
        query,
        filters: filters.join(","),
        unindexed,
      };
      dom.window.history.pushState(urlState, "", buildUrl(urlState));
      loadSearch();
    });
    for (const select of form.querySelectorAll("select[name]") ?? []) {
      select.addEventListener("change", () => form.requestSubmit());
    }
    const unindexedToggle = form.querySelector('input[name="unindexed"]');
    unindexedToggle?.addEventListener("change", () => form.requestSubmit());
  }

  function collectFilters(form) {
    const parts = [];
    for (const select of form.querySelectorAll("select[name]")) {
      const key = select.name;
      const values = [...select.selectedOptions]
        .map((option) => option.value)
        .filter(Boolean);
      for (const value of values) parts.push(`${key}:${value}`);
    }
    return parts;
  }

  // 结构化搜索异步加载（文档视图专用）。
  async function loadSearch() {
    searchResult = null;
    searchError = false;
    render();
    const params = new URLSearchParams();
    if (urlState.query) params.set("q", urlState.query);
    if (urlState.filters) params.set("filters", urlState.filters);
    if (urlState.unindexed === "1") params.set("unindexed", "1");
    if (params.size === 0) return;
    try {
      const response = await fetchApi(`/api/search?${params.toString()}`, {
        signal: AbortSignal.timeout(5000),
      });
      searchResult = await response.json();
    } catch {
      searchError = true;
    }
    render();
    bindDocumentsActions();
  }

  // 历史筛选表单：提交写入 URL 并重新查询。
  function bindHistoryActions() {
    const form = dom.document.querySelector("#history-filter");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const theme = form.querySelector("#history-theme")?.value.trim() ?? "";
      const filters = [];
      for (const field of ["date", "tag", "range", "basis"]) {
        const value = form.querySelector(`input[name="${field}"]`)?.value.trim() ?? "";
        if (value) filters.push(`${field}:${value}`);
      }
      scrollY = dom.window.scrollY;
      urlState = { ...urlState, theme, historyFilters: filters.join(",") };
      dom.window.history.pushState(urlState, "", buildUrl(urlState));
      loadHistory();
    });
  }

  // 语义历史时间线异步加载（历史视图专用）。
  async function loadHistory() {
    historyData = null;
    historyError = false;
    render();
    const params = new URLSearchParams();
    if (urlState.theme) params.set("theme", urlState.theme);
    if (urlState.historyFilters) params.set("filters", urlState.historyFilters);
    try {
      const response = await fetchApi(`/api/history?${params.toString()}`, {
        signal: AbortSignal.timeout(5000),
      });
      historyData = await response.json();
    } catch {
      historyError = true;
    }
    render();
    bindHistoryActions();
  }

  // 关系页：实体选择与筛选写入 URL 并重新查询。
  function bindRelationsActions() {
    const form = dom.document.querySelector("#relation-pick");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const entity = form.querySelector("#relation-entity")?.value ?? "";
      const filters = collectRelationFilters(form);
      scrollY = dom.window.scrollY;
      urlState = { ...urlState, entity, filters: filters.join(","), depth: "1" };
      dom.window.history.pushState(urlState, "", buildUrl(urlState));
      loadRelations();
    });
    for (const select of form.querySelectorAll("select[name]") ?? []) {
      select.addEventListener("change", () => form.requestSubmit());
    }
  }

  function collectRelationFilters(form) {
    const parts = [];
    for (const select of form.querySelectorAll("select[name]")) {
      if (select.name === "entity") continue;
      const key = select.name;
      const values = [...select.selectedOptions]
        .map((option) => option.value)
        .filter(Boolean);
      for (const value of values) parts.push(`${key}:${value}`);
    }
    return parts;
  }

  // 局部关系图异步加载（关系视图专用）。
  async function loadRelations() {
    relationData = null;
    relationError = null;
    render();
    if (!urlState.entity) return;
    const params = new URLSearchParams({
      entity: urlState.entity,
      depth: String(Number(urlState.depth) || 1),
    });
    if (urlState.filters) params.set("filters", urlState.filters);
    try {
      const response = await fetchApi(`/api/relations?${params.toString()}`, {
        signal: AbortSignal.timeout(5000),
      });
      relationData = await response.json();
    } catch {
      relationError = "load-failed";
    }
    render();
    bindRelationsActions();
  }

  // 依赖图异步加载（探路/交付视图，实体选中时）。
  async function loadGraph() {
    graphData = null;
    graphError = false;
    render();
    if (!urlState.entity) return;
    const kind = urlState.view === "delivery" ? "ticket" : "decision";
    try {
      const params = new URLSearchParams({
        entity: urlState.entity,
        kind,
        depth: String(Number(urlState.depth) || 1),
      });
      const response = await fetchApi(`/api/graph?${params.toString()}`, {
        signal: AbortSignal.timeout(5000),
      });
      graphData = await response.json();
    } catch {
      graphError = true;
    }
    render();
  }

  // 实体详情异步加载（阅读页专用）。
  async function loadReaderDetail(entityId) {
    readerDetail = null;
    readerLoadError = null;
    render();
    bindReaderActions();
    try {
      const response = await fetchApi(`/api/entities/${encodeURIComponent(entityId)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === 404) {
        readerLoadError = "not-found";
      } else if (!response.ok) {
        readerLoadError = "load-failed";
      } else {
        readerDetail = await response.json();
      }
    } catch {
      readerLoadError = "load-failed";
    }
    render();
    bindReaderActions();
  }

  function updateNavigation() {
    for (const link of dom.document.querySelectorAll("#nav a")) {
      if (link.dataset.view === urlState.view) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  }

  function updateSnapshotState() {
    if (!snapshot) {
      snapshotState.textContent = "";
      return;
    }
    const state = snapshot.snapshot;
    if (state.status === "stale") {
      snapshotState.innerHTML = `<span class="stale">快照已过期${state.lastError ? `：${escapeAttribute(state.lastError)}` : ""}</span>`;
    } else {
      snapshotState.innerHTML = `<span class="fresh">快照有效 · ${new Date(state.generatedAt).toLocaleTimeString()}</span>`;
    }
  }

  // 同源内链：pushState + 局部渲染，不整页 reload。
  function onLinkClick(event) {
    const anchor = event.target.closest?.("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (href === "#" && anchor.hasAttribute("aria-disabled")) {
      // 未解析/不安全目标不可导航。
      event.preventDefault();
      return;
    }
    if (!href.startsWith("?")) return;
    event.preventDefault();
    if (navigationDrawerOpen && nav?.contains(anchor)) {
      setNavigationDrawer(false);
    }
    scrollY = dom.window.scrollY;
    urlState = parseUrl(href);
    dom.window.history.pushState(urlState, "", href);
    navigate();
  }

  // 视图切换后的副作用：阅读页详情、文档搜索、历史时间线与依赖图加载。
  function navigate() {
    if (urlState.view === "reader" && urlState.entity) {
      loadReaderDetail(urlState.entity);
    } else if (urlState.view === "documents") {
      loadSearch();
    } else if (urlState.view === "history") {
      loadHistory();
    } else if (urlState.view === "wayfinding" || urlState.view === "delivery") {
      if (urlState.entity) {
        loadGraph();
      } else {
        render();
      }
    } else if (urlState.view === "relations") {
      loadRelations();
    } else {
      render();
    }
  }

  async function fetchSnapshot() {
    const response = await fetchApi("/api/snapshot", {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`快照请求失败: ${response.status}`);
    return response.json();
  }

  async function refresh() {
    if (snapshot === null) {
      // 首屏加载失败后的重试路径：成功则恢复渲染。
      try {
        snapshot = await fetchSnapshot();
        loadError = null;
        render();
        return;
      } catch (error) {
        loadError = error instanceof Error ? error.message : String(error);
        render();
        return;
      }
    }
    try {
      const next = await fetchSnapshot();
      snapshot = next;
      if (snapshot.snapshot.status === "stale") {
        updateSnapshotState();
        return;
      }
      if (urlState.view === "reader" && urlState.entity) {
        // 当前对象仍存在：保留选中、滚动与检查器开关，仅更新详情。
        loadReaderDetail(urlState.entity);
        updateNavigation();
        updateSnapshotState();
      } else if (urlState.view === "documents") {
        loadSearch();
      } else if (urlState.view === "history") {
        loadHistory();
      } else if (urlState.view === "wayfinding" || urlState.view === "delivery") {
        if (urlState.entity) {
          loadGraph();
        } else {
          render();
        }
      } else if (urlState.view === "relations") {
        loadRelations();
      } else {
        render();
      }
    } catch {
      snapshotState.innerHTML = '<span class="stale">刷新失败，显示最后成功快照</span>';
    }
  }

  async function boot() {
    loadError = null;
    try {
      snapshot = await fetchSnapshot();
    } catch (error) {
      loadError = error instanceof Error ? error.message : String(error);
      snapshot = null;
    }
    navigate();
    const events = new dom.EventSource("/events");
    events.addEventListener("snapshot-changed", () => refresh());
    events.addEventListener("snapshot-stale", () => {
      updateSnapshotState();
      refresh();
    });
    events.addEventListener("update", () => refresh());
  }

  dom.window.addEventListener("popstate", (event) => {
    if (navigationDrawerOpen) setNavigationDrawer(false);
    scrollY = dom.window.scrollY;
    urlState = parseUrl(dom.window.location.search);
    navigate();
  });
  dom.document.addEventListener("click", onLinkClick);
  return { boot, refresh, render, navigate };
}

// 浏览器入口。
if (typeof document !== "undefined" && typeof window !== "undefined") {
  createWorkbench({ document, window, fetch, EventSource }).boot();
}

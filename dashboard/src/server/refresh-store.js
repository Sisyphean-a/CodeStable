// 刷新存储：指纹轮询、完整重建、原子替换与快照状态。
// 重建成功才替换索引并通知 changed；失败保留最后成功索引并标记 stale。

import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";

const DEFAULT_POLL_INTERVAL_MS = 750;

export function createRefreshStore(projectRoot, options = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const buildIndex = options.buildIndex ?? (() => {
    throw new Error("buildIndex is required");
  });
  const getFingerprint = options.fingerprintReader ?? projectFingerprint;

  let index = null;
  let state = { status: "fresh", generatedAt: null };
  let fingerprint = "";
  let rebuilding = false;
  let pollTimer = null;
  const listeners = new Set();

  const notify = (event) => {
    for (const listener of listeners) listener(event);
  };

  function markStale(error) {
    state = {
      status: "stale",
      generatedAt: index?.generatedAt ?? null,
      staleSince: state.status === "stale" ? state.staleSince : Date.now(),
      lastError: formatError(error),
    };
    notify({ type: "stale", error });
  }

  async function rebuild() {
    if (rebuilding) return;
    rebuilding = true;
    try {
      const next = await buildIndex(projectRoot, index);
      index = next;
      state = { status: "fresh", generatedAt: next.generatedAt };
      notify({ type: "changed" });
      return true;
    } catch (error) {
      markStale(error);
      return false;
    } finally {
      rebuilding = false;
    }
  }

  async function poll() {
    try {
      const next = await getFingerprint(projectRoot);
      if (next === fingerprint) return;
      fingerprint = next;
      await rebuild();
    } catch (error) {
      markStale(error);
    }
  }

  function start() {
    return rebuild().then(async (built) => {
      if (!built) throw new Error(state.lastError ?? "initial index build failed");
      fingerprint = await getFingerprint(projectRoot);
      pollTimer = setInterval(poll, pollIntervalMs);
      return state;
    });
  }

  function stop() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    listeners.clear();
  }

  return {
    get index() {
      return index;
    },
    get state() {
      return state;
    },
    rebuild,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    stop,
  };
}

async function projectFingerprint(projectRoot) {
  const inputs = [
    join(projectRoot, ".codestable"),
    join(projectRoot, ".wayfinding"),
    join(projectRoot, ".delivery"),
    join(projectRoot, ".git", "HEAD"),
    join(projectRoot, ".git", "index"),
  ];
  const parts = [];
  for (const input of inputs) {
    for (const path of await trackedPaths(input)) {
      if (path.startsWith("missing:")) {
        parts.push(path);
        continue;
      }
      const metadata = await stat(path);
      parts.push(`${path}:${metadata.mtimeMs}:${metadata.size}`);
    }
  }
  return parts.sort().join("|");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function trackedPaths(path) {
  try {
    await stat(path);
  } catch {
    return [`missing:${path}`];
  }
  const metadata = await stat(path);
  if (!metadata.isDirectory()) return [path];
  const paths = [path];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.name === "node_modules" || entry.name === ".tmp" || entry.name === ".git") continue;
    paths.push(...(await trackedPaths(join(path, entry.name))));
  }
  return paths;
}

import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { platform } from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_PORT = 43173;
const POLL_INTERVAL_MS = 750;

export function parseWebArguments(args) {
  const options = { openBrowser: true, port: DEFAULT_PORT };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--no-open") {
      options.openBrowser = false;
      continue;
    }
    if (argument === "--port") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new Error("--port must be an integer between 1 and 65535");
      }
      options.port = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  return options;
}

export async function findProjectRoot(startDirectory) {
  let candidate = resolve(startDirectory);

  while (true) {
    if (await isDirectory(join(candidate, ".codestable"))) {
      return candidate;
    }
    const parent = dirname(candidate);
    if (parent === candidate) return undefined;
    candidate = parent;
  }
}

export async function createSnapshot(projectRoot) {
  const [maps, deliveries, history, git, skills] = await Promise.all([
    scanMaps(projectRoot),
    scanDeliveries(projectRoot),
    scanHistory(projectRoot),
    scanGit(projectRoot),
    scanSkills(projectRoot),
  ]);

  return {
    project: {
      root: projectRoot,
      name: await projectName(projectRoot),
      hasArchitectureIndex: await exists(
        join(projectRoot, ".codestable", "architecture", "INDEX.md"),
      ),
      hasRequirementsContext: await exists(
        join(projectRoot, ".codestable", "requirements", "CONTEXT.md"),
      ),
    },
    maps,
    deliveries,
    history,
    git,
    skills,
    scannedAt: new Date().toISOString(),
  };
}

export async function startDashboard(startDirectory, options = {}) {
  const projectRoot = await findProjectRoot(startDirectory);
  if (!projectRoot) {
    throw new Error(
      "No .codestable directory found from the current directory upward.",
    );
  }

  let snapshot = await createSnapshot(projectRoot);
  let fingerprint = await projectFingerprint(projectRoot);
  const clients = new Set();
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;

    if (path === "/") {
      send(response, 200, "text/html; charset=utf-8", pageHtml());
      return;
    }
    if (path === "/api/snapshot") {
      send(
        response,
        200,
        "application/json; charset=utf-8",
        JSON.stringify(snapshot),
      );
      return;
    }
    if (path === "/events") {
      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      });
      response.write("retry: 1000\n\n");
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }
    send(response, 404, "text/plain; charset=utf-8", "Not found");
  });

  const requestedPort = options.port ?? DEFAULT_PORT;
  await listen(server, requestedPort);
  const listeningAddress = server.address();
  const port =
    typeof listeningAddress === "object" && listeningAddress
      ? listeningAddress.port
      : requestedPort;
  const address = `http://127.0.0.1:${port}`;
  console.log(`CodeStable dashboard: ${address}`);
  console.log(`Project: ${projectRoot}`);
  console.log("Press Ctrl+C to stop.");

  const poll = setInterval(async () => {
    try {
      const nextFingerprint = await projectFingerprint(projectRoot);
      if (nextFingerprint === fingerprint) return;
      fingerprint = nextFingerprint;
      snapshot = await createSnapshot(projectRoot);
      for (const client of clients)
        client.write("event: update\ndata: changed\n\n");
    } catch (error) {
      console.error(`Dashboard refresh failed: ${formatError(error)}`);
    }
  }, POLL_INTERVAL_MS);

  const stop = () =>
    new Promise((resolveStop) => {
      clearInterval(poll);
      for (const client of clients) client.end();
      server.close(resolveStop);
    });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  if (options.openBrowser !== false) openBrowser(address);
  return { address, projectRoot, server, stop };
}

async function scanMaps(projectRoot) {
  const mapRoot = join(projectRoot, ".wayfinding");
  if (!(await isDirectory(mapRoot))) return [];

  const entries = await readdir(mapRoot, { withFileTypes: true });
  const maps = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const root = join(mapRoot, entry.name);
    const mapPath = join(root, "map.md");
    if (!(await exists(mapPath))) continue;

    const decisionsRoot = join(root, "decisions");
    const decisionPaths = await markdownFiles(decisionsRoot);
    const decisions = await Promise.all(decisionPaths.map(readDecision));
    const byPath = new Map(
      decisions.map((decision) => [decision.path, decision]),
    );
    let blocked = 0;
    let frontier = 0;
    for (const decision of decisions) {
      if (decision.status === "closed") continue;
      const dependenciesClosed = decision.dependencies.every(
        (dependency) => byPath.get(dependency)?.status === "closed",
      );
      if (!dependenciesClosed) blocked += 1;
      if (dependenciesClosed && !decision.owner) frontier += 1;
    }

    const mapText = await readText(mapPath);
    const fog =
      sectionLineCount(mapText, "迷雾") || sectionLineCount(mapText, "Fog");
    const closed = decisions.filter(
      (decision) => decision.status === "closed",
    ).length;
    const open = decisions.length - closed;
    maps.push({
      name: heading(mapText) ?? entry.name,
      path: dashboardPath(projectRoot, mapPath),
      closed,
      open,
      blocked,
      frontier,
      fog,
      progress: progress(closed, decisions.length + fog),
    });
  }
  return maps.sort((left, right) => left.name.localeCompare(right.name));
}

async function scanDeliveries(projectRoot) {
  const roots = await deliveryRoots(projectRoot);
  const deliveries = [];
  for (const root of roots) {
    const ticketPaths = await markdownFiles(join(root, "tickets"));
    const tickets = await Promise.all(ticketPaths.map(readTicket));
    const byPath = new Map(tickets.map((ticket) => [ticket.path, ticket]));
    let blocked = 0;
    let ready = 0;
    let claimed = 0;
    for (const ticket of tickets) {
      if (ticket.status === "closed") continue;
      const dependenciesClosed = ticket.dependencies.every(
        (dependency) => byPath.get(dependency)?.status === "closed",
      );
      if (!dependenciesClosed) blocked += 1;
      if (ticket.owner) claimed += 1;
      if (dependenciesClosed && !ticket.owner) ready += 1;
    }

    const closed = tickets.filter(
      (ticket) => ticket.status === "closed",
    ).length;
    deliveries.push({
      name: basename(root),
      path: dashboardPath(projectRoot, root),
      hasSpec: await exists(join(root, "spec.md")),
      total: tickets.length,
      closed,
      open: tickets.length - closed,
      blocked,
      claimed,
      ready,
      progress: progress(closed, tickets.length),
    });
  }
  return deliveries.sort((left, right) => left.path.localeCompare(right.path));
}

async function scanHistory(projectRoot) {
  const historyRoot = join(projectRoot, ".codestable", "history");
  const paths = await markdownFiles(historyRoot);
  const months = [];
  for (const path of paths) {
    const text = await readText(path);
    months.push({
      name: heading(text) ?? basename(path, ".md"),
      path: dashboardPath(projectRoot, path),
      entries: text
        .split("\n")
        .filter((line) => /^- \d{4}-\d{2}-\d{2}/.test(line)).length,
    });
  }
  return months.sort((left, right) => right.name.localeCompare(left.name));
}

async function scanSkills(projectRoot) {
  const root = join(projectRoot, "skills");
  if (!(await isDirectory(root))) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      (await exists(join(root, entry.name, "SKILL.md")))
    )
      skills.push(entry.name);
  }
  return skills.sort();
}

async function scanGit(projectRoot) {
  try {
    const [{ stdout: status }, { stdout: commit }] = await Promise.all([
      execFileAsync("git", ["status", "--porcelain=v1", "--branch"], {
        cwd: projectRoot,
        timeout: 2000,
      }),
      execFileAsync(
        "git",
        ["log", "-1", "--pretty=format:%h %ad %s", "--date=short"],
        {
          cwd: projectRoot,
          timeout: 2000,
        },
      ),
    ]);
    const lines = status.trimEnd().split("\n");
    const branch = lines[0]?.replace(/^## /, "").split("...")[0] ?? "unknown";
    const changed = lines.filter(
      (line) => line && !line.startsWith("## "),
    ).length;
    return { available: true, branch, changed, commit: commit.trim() };
  } catch {
    return {
      available: false,
      branch: "not a git repository",
      changed: 0,
      commit: "",
    };
  }
}

async function projectName(projectRoot) {
  const indexPath = join(
    projectRoot,
    ".codestable",
    "architecture",
    "INDEX.md",
  );
  if (await exists(indexPath))
    return heading(await readText(indexPath)) ?? basename(projectRoot);
  return basename(projectRoot);
}

async function deliveryRoots(projectRoot) {
  const roots = [];
  const directRoot = join(projectRoot, ".delivery");
  if (await isDirectory(directRoot)) {
    for (const entry of await readdir(directRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(join(directRoot, entry.name));
    }
  }

  const mapRoot = join(projectRoot, ".wayfinding");
  if (await isDirectory(mapRoot)) {
    for (const entry of await readdir(mapRoot, { withFileTypes: true })) {
      const deliveryRoot = join(mapRoot, entry.name, "delivery");
      if (entry.isDirectory() && (await isDirectory(deliveryRoot)))
        roots.push(deliveryRoot);
    }
  }
  return roots;
}

async function readDecision(path) {
  const text = await readText(path);
  const frontmatter = frontmatterFields(text);
  return {
    path: resolve(path),
    status: normalizeStatus(frontmatter.get("状态")),
    owner: unquote(frontmatter.get("认领者")),
    dependencies: resolveDependencies(path, frontmatter.get("硬依赖")),
  };
}

async function readTicket(path) {
  return readDecision(path);
}

function frontmatterFields(text) {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  const fields = new Map();
  if (!match) return fields;
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    fields.set(
      line.slice(0, separator).trim(),
      line.slice(separator + 1).trim(),
    );
  }
  return fields;
}

function resolveDependencies(path, value) {
  if (!value || value === "[]") return [];
  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)
    .map((dependency) => resolve(dirname(path), dependency));
}

function normalizeStatus(value) {
  return value?.includes("关闭") || value?.toLowerCase() === "closed"
    ? "closed"
    : "open";
}

function sectionLineCount(text, title) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start < 0) return 0;

  let count = 0;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    if (line.trim() && !line.trim().startsWith("<!--")) count += 1;
  }
  return count;
}

function progress(closed, total) {
  return total === 0 ? null : Math.round((closed / total) * 100);
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

async function trackedPaths(path) {
  if (!(await exists(path))) return [`missing:${path}`];
  const metadata = await stat(path);
  if (!metadata.isDirectory()) return [path];
  const paths = [path];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    paths.push(...(await trackedPaths(join(path, entry.name))));
  }
  return paths;
}

async function markdownFiles(root) {
  if (!(await isDirectory(root))) return [];
  const paths = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isFile() && entry.name.endsWith(".md")) paths.push(path);
    if (entry.isDirectory()) paths.push(...(await markdownFiles(path)));
  }
  return paths;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(path) {
  try {
    const metadata = await stat(path);
    return metadata.isDirectory();
  } catch {
    return false;
  }
}

async function readText(path) {
  return readFile(path, "utf8");
}

function unquote(value) {
  return value?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

function dashboardPath(projectRoot, path) {
  return relative(projectRoot, path).replace(/\\/g, "/");
}

function heading(text) {
  return text.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function send(response, status, contentType, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  });
  response.end(body);
}

function listen(server, port) {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
}

function openBrowser(address) {
  let command = "xdg-open";
  let args = [address];
  if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", address];
  } else if (platform === "darwin") {
    command = "open";
  }
  import("node:child_process")
    .then(({ spawn }) => {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      child.unref();
    })
    .catch(() => {});
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function pageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CodeStable Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      font-family: "Helvetica Neue", "SF Pro Display", Arial, sans-serif;
      background: #f7f6f3;
      color: #2f3437;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f7f6f3; color: #2f3437; }
    main { max-width: 1120px; margin: 0 auto; padding: 56px 28px 72px; }
    header { display: flex; justify-content: space-between; gap: 24px; align-items: end; border-bottom: 1px solid #eaeaea; padding-bottom: 24px; }
    h1, h2 { margin: 0; font-weight: 500; } h1 { font-family: Georgia, "Times New Roman", serif; font-size: 2.25rem; line-height: 1.1; } h2 { font-size: .75rem; letter-spacing: .08em; text-transform: uppercase; }
    .meta { color: #787774; font-family: "SFMono-Regular", Consolas, monospace; font-size: .75rem; line-height: 1.6; overflow-wrap: anywhere; }
    .grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; margin-top: 24px; }
    section { background: #fff; border: 1px solid #eaeaea; border-radius: 8px; min-height: 168px; padding: 28px; opacity: 0; transform: translateY(12px); transition: opacity 600ms cubic-bezier(.16, 1, .3, 1), transform 600ms cubic-bezier(.16, 1, .3, 1); }
    section.is-visible { opacity: 1; transform: translateY(0); }
    section:nth-child(1) { grid-column: span 7; } section:nth-child(2) { grid-column: span 5; } section:nth-child(3) { grid-column: span 5; } section:nth-child(4) { grid-column: span 7; }
    h2 { margin-bottom: 24px; }
    .item { border-top: 1px solid #eaeaea; padding: 14px 0; } .item:first-of-type { border-top: 0; padding-top: 0; }
    .row { align-items: center; display: flex; justify-content: space-between; gap: 16px; } strong { font-size: .9rem; font-weight: 500; overflow-wrap: anywhere; }
    .muted { color: #787774; font-size: .85rem; }
    .good, .warn { border-radius: 999px; font-family: "SFMono-Regular", Consolas, monospace; font-size: .65rem; letter-spacing: .05em; padding: 4px 7px; text-transform: uppercase; white-space: nowrap; }
    .good { background: #edf3ec; color: #346538; } .warn { background: #fbf3db; color: #956400; }
    @media (prefers-color-scheme: dark) {
      :root, body { background: #1b1b19; color: #edede8; } section { background: #232321; border-color: #3a3a36; } header, .item { border-color: #3a3a36; } .meta, .muted { color: #adada7; } .good { background: #283a28; color: #a4d4a4; } .warn { background: #453818; color: #f1cf76; }
    }
    @media (max-width: 720px) { main { padding: 28px 16px 48px; } header { align-items: start; flex-direction: column; } h1 { font-size: 1.85rem; } .grid { grid-template-columns: 1fr; } section, section:nth-child(n) { grid-column: 1; padding: 22px; } }
    @media (prefers-reduced-motion: reduce) { section { opacity: 1; transform: none; transition: none; } }
  </style>
</head>
<body>
  <main>
    <header><div><h1>CodeStable Dashboard</h1><div id="project" class="meta"></div></div><div id="updated" class="meta"></div></header>
    <div class="grid">
      <section><h2>Decision Maps</h2><div id="maps"></div></section>
      <section><h2>Delivery</h2><div id="delivery"></div></section>
      <section><h2>History</h2><div id="history"></div></section>
      <section><h2>Project</h2><div id="details"></div></section>
    </div>
  </main>
  <script>
    const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (character) => {
      if (character === "&") return "&amp;";
      if (character === "<") return "&lt;";
      if (character === ">") return "&gt;";
      return "&quot;";
    });
    const item = (title, detail, state = "") => '<div class="item"><div class="row"><strong>' + escapeHtml(title) + '</strong><span class="' + escapeHtml(state) + '">' + escapeHtml(detail) + '</span></div></div>';
    const empty = (text) => '<span class="muted">' + escapeHtml(text) + '</span>';
    const progress = (value) => value === null ? "n/a" : value + "%";
    const render = (snapshot) => {
      document.title = snapshot.project.name + " - CodeStable Dashboard";
      document.querySelector("#project").textContent = snapshot.project.name + " | " + snapshot.project.root;
      document.querySelector("#updated").textContent = "Updated " + new Date(snapshot.scannedAt).toLocaleTimeString();
      document.querySelector("#maps").innerHTML = snapshot.maps.length ? snapshot.maps.map((map) => item(map.name, progress(map.progress), map.open ? "warn" : "good") + '<div class="meta">closed ' + map.closed + ' | open ' + map.open + ' | blocked ' + map.blocked + ' | frontier ' + map.frontier + ' | fog ' + map.fog + '</div>').join("") : empty("No active decision maps");
      document.querySelector("#delivery").innerHTML = snapshot.deliveries.length ? snapshot.deliveries.map((delivery) => item(delivery.name, progress(delivery.progress), delivery.open ? "warn" : "good") + '<div class="meta">closed ' + delivery.closed + '/' + delivery.total + ' | ready ' + delivery.ready + ' | claimed ' + delivery.claimed + ' | blocked ' + delivery.blocked + '</div>').join("") : empty("No delivery surfaces");
      document.querySelector("#history").innerHTML = snapshot.history.length ? snapshot.history.map((month) => item(month.name, month.entries + " changes")).join("") : empty("No CodeStable history");
      const git = snapshot.git.available ? snapshot.git.branch + " | " + (snapshot.git.changed ? snapshot.git.changed + " changed" : "clean") : snapshot.git.branch;
      document.querySelector("#details").innerHTML = item("Git", git, snapshot.git.changed ? "warn" : "good") + item("Skills", snapshot.skills.length + " available") + (snapshot.git.commit ? '<div class="meta">' + snapshot.git.commit + '</div>' : "");
    };
    const revealCards = () => {
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }, { threshold: .08 });
      document.querySelectorAll("section").forEach((section, index) => {
        section.style.transitionDelay = (index * 80) + "ms";
        observer.observe(section);
      });
    };
    fetch("/api/snapshot").then((response) => response.json()).then((snapshot) => { render(snapshot); revealCards(); });
    const events = new EventSource("/events");
    events.addEventListener("update", () => location.reload());
  </script>
</body>
</html>`;
}

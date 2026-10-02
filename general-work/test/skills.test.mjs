import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const bundle = fileURLToPath(new URL("../", import.meta.url));
const expectedNames = ["check", "grill-me", "memory", "record", "setup", "work"];

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : path.endsWith(".md") ? [path] : [];
  });
}

function assertLocalLinks(path, runtimePointers = false) {
  const raw = readFileSync(path, "utf8");
  const text = raw.replace(/```[\s\S]*?```/g, "");
  const targets = [...text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)].map((match) => match[1]);
  if (runtimePointers) {
    const pointers = [...raw.matchAll(/`((?:\.assistant\/|(?:\.\.\/)?\.agents\/skills\/)[^`\n]+\.md)`/g)];
    assert.ok(pointers.length > 0, `${path}: 缺少运行时入口指针`);
    targets.push(...pointers.map((match) => match[1]));
  }
  for (const href of targets) {
    if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("#")) continue;
    const target = resolve(dirname(path), decodeURIComponent(href.split("#")[0]));
    assert.ok(existsSync(target), `${path}: 引用不存在 ${href}`);
    assert.ok(statSync(target).isFile(), `${path}: 引用不是文件 ${href}`);
  }
}

test("整套包含六个技能，其中部署技能只由用户显式调用", () => {
  const root = join(bundle, "skills");
  const names = readdirSync(root).sort();
  assert.deepEqual(names, expectedNames);
  for (const name of names) {
    const path = join(root, name, "SKILL.md");
    const text = readFileSync(path, "utf8");
    const header = text.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n/);
    assert.ok(header, `${name}: 缺少 frontmatter`);
    assert.match(header[1], new RegExp(`^name: ${name}$`, "m"));
    const description = header[1].match(/^description: (".*")$/m);
    assert.ok(description, `${name}: 缺少描述`);
    const value = JSON.parse(description[1]);
    assert.ok(value.trim().length > 0 && value.length <= 1024, `${name}: 描述无效`);
    const userInvokedOnly = /^disable-model-invocation: true$/m.test(header[1]);
    assert.equal(userInvokedOnly, name === "setup", `${name}: 只有 setup 可限制为仅用户调用`);
  }
});

test("部署流程只由 setup 拥有，日常入口不复述初始化", () => {
  for (const path of markdownFiles(join(bundle, "skills"))) {
    const text = readFileSync(path, "utf8");
    if (path.includes(`${sep}setup${sep}`)) {
      assert.match(text, /\.agents[\\/]skills/, "setup: 应说明部署位置");
      continue;
    }
    assert.doesNotMatch(text, /\bsetup\b/i, `${path}: 日常技能不应引用部署技能`);
    assert.doesNotMatch(text, /\.agents[\\/]skills/, `${path}: 日常技能不应包含部署路径`);
  }
  for (const name of ["AGENTS.md", join(".assistant", "INDEX.md")]) {
    const text = readFileSync(join(bundle, "workspace", name), "utf8");
    assert.doesNotMatch(text, /\bsetup\b|部署|安装|初始化/, `${name}: 工作区入口不应包含初始化说明`);
  }
});

test("技能正文、共享协议、参考与使用说明的本地链接有效", () => {
  for (const path of markdownFiles(join(bundle, "skills"))) assertLocalLinks(path);
  assertLocalLinks(join(bundle, "README.md"));
});

test("整套复制后入口与跨技能引用可达，模板没有预造画像", () => {
  const temporary = resolve(bundle, "../.tmp");
  mkdirSync(temporary, { recursive: true });
  const workspace = mkdtempSync(join(temporary, "general-work-test-"));
  try {
    cpSync(join(bundle, "skills"), join(workspace, ".agents", "skills"), { recursive: true });
    cpSync(join(bundle, "workspace"), workspace, { recursive: true });
    const deployedSkills = join(workspace, ".agents", "skills");
    assert.deepEqual(readdirSync(deployedSkills).sort(), expectedNames);
    for (const path of markdownFiles(workspace)) assertLocalLinks(path);
    assert.deepEqual(readdirSync(join(workspace, ".assistant")), ["INDEX.md"]);
    assertLocalLinks(join(workspace, "AGENTS.md"), true);
    assertLocalLinks(join(workspace, ".assistant", "INDEX.md"), true);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

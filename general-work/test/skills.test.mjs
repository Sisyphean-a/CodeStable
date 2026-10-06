import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const bundle = fileURLToPath(new URL("../", import.meta.url));
const expectedNames = ["check", "grill-me", "memory", "record", "setup", "work"];
const protocol = join(bundle, "skills", "memory", "references", "context-model.md");

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : path.endsWith(".md") ? [path] : [];
  });
}

function localTargets(path) {
  const text = readFileSync(path, "utf8").replace(/```[\s\S]*?```/g, "");
  return [...text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)]
    .map((match) => match[1])
    .filter((href) => !/^[a-z][a-z\d+.-]*:/i.test(href) && !href.startsWith("#"))
    .map((href) => resolve(dirname(path), decodeURIComponent(href.split("#")[0])));
}

function assertLocalLinks(path) {
  for (const target of localTargets(path)) {
    assert.ok(existsSync(target), `${path}: 引用不存在 ${target}`);
    assert.ok(statSync(target).isFile(), `${path}: 引用不是文件 ${target}`);
  }
}

test("六个技能声明有效，只有知识库初始化要求用户显式调用", () => {
  const root = join(bundle, "skills");
  assert.deepEqual(readdirSync(root).sort(), expectedNames);
  for (const name of expectedNames) {
    const text = readFileSync(join(root, name, "SKILL.md"), "utf8");
    const header = text.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n/);
    assert.ok(header, `${name}: 缺少 frontmatter`);
    assert.match(header[1], new RegExp(`^name: ${name}$`, "m"));
    const description = header[1].match(/^description: (".*")$/m);
    assert.ok(description, `${name}: 缺少描述`);
    const value = JSON.parse(description[1]);
    assert.ok(value.trim().length > 0 && value.length <= 1024, `${name}: 描述无效`);
    assert.equal(/^disable-model-invocation: true$/m.test(header[1]), name === "setup");
  }
});

test("技能自带参考，不依赖仓库模板或特定宿主的安装路径", () => {
  assert.equal(existsSync(join(bundle, "workspace")), false);
  for (const path of markdownFiles(join(bundle, "skills"))) {
    const text = readFileSync(path, "utf8");
    assert.doesNotMatch(text, /\.agents[\\/]skills|\.pi[\\/]|\bPi\b|pi --|\/reload|workspace[\\/]/);
    assertLocalLinks(path);
  }
  assertLocalLinks(join(bundle, "README.md"));
});

test("各技能从唯一协议读取用户知识，日常技能不调用初始化技能", () => {
  for (const name of expectedNames) {
    const path = join(bundle, "skills", name, "SKILL.md");
    assert.ok(localTargets(path).includes(protocol), `${name}: 缺少上下文协议入口`);
    if (name !== "setup") {
      assert.doesNotMatch(readFileSync(path, "utf8"), /\bsetup\b/);
    }
  }
  const text = readFileSync(protocol, "utf8");
  assert.match(text, /~\/\.assistant\//);
  assert.match(text, /knowledge\/shared\//);
  assert.match(text, /knowledge\/projects\//);
});

test("文档适配从共用协议按需到达，修复规则随技能安装", () => {
  const maintenance = join(bundle, "skills", "memory", "references", "maintenance.md");
  assert.ok(localTargets(protocol).includes(maintenance), "各技能共用的协议缺少维护入口");
  assert.ok(existsSync(maintenance), "缺少维护分支规则");
  assertLocalLinks(maintenance);
  assert.equal(
    markdownFiles(join(bundle, "skills")).filter((path) => localTargets(path).includes(maintenance)).length,
    1,
    "维护规则只从共用协议到达，不复制进每个技能",
  );
});

test("工作约定有唯一归属与执行读取入口，不分发实际约定或宿主指令", () => {
  const text = readFileSync(protocol, "utf8");
  assert.equal([...text.matchAll(/^\| `working-rules\.md` \|/gm)].length, 1);
  const entry = text.split(/## 唯一入口\r?\n/)[1].split(/\r?\n## /)[0];
  assert.match(entry, /`working-rules\.md`/, "日常执行必须能找到工作约定");
  const files = markdownFiles(join(bundle, "skills"));
  assert.ok(files.every((path) => !/[\\/](?:working-rules|AGENTS|CLAUDE)\.md$/.test(path)));
});

test("旁观画像有独立数据归属和按需参考，不增加技能或分发真实画像", () => {
  const observer = join(bundle, "skills", "memory", "references", "observer-model.md");
  const text = readFileSync(protocol, "utf8");
  assert.equal([...text.matchAll(/^\| `portrait\.md` \|/gm)].length, 1, "画像应有唯一归属");
  assert.ok(localTargets(protocol).includes(observer), "协议应能到达画像分支规则");
  assertLocalLinks(observer);
  assert.equal(existsSync(join(bundle, "skills", "memory", "portrait.md")), false);
});

test("只安装技能目录即可解析全部参考，不预置用户数据", () => {
  const temporary = resolve(bundle, "../.tmp");
  mkdirSync(temporary, { recursive: true });
  const fixture = mkdtempSync(join(temporary, "general-work-test-"));
  try {
    const installed = join(fixture, "installed-skills");
    cpSync(join(bundle, "skills"), installed, { recursive: true });
    assert.deepEqual(readdirSync(installed).sort(), expectedNames);
    for (const path of markdownFiles(installed)) {
      for (const target of localTargets(path)) {
        assert.ok(target.startsWith(installed + "/") || target.startsWith(installed + "\\"), `${path}: 引用逃出技能目录`);
      }
      assertLocalLinks(path);
    }
    assert.equal(existsSync(join(fixture, ".assistant")), false);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

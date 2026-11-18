import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { COMMUNITY, candidates, configDir, findCommunity, siblingEntries } from "../plugin/community.mjs";

// magpie 把每个插件装进 <config>/plugins/node_modules。本插件可能在其中任一层
// （node_modules/magpie-wpt/plugin/ 或 node_modules/magpie-wpt-import/），社区
// 插件始终是它的邻居——这就是容器里唯一靠得住的那条路。
const tree = () => {
  const root = mkdtempSync(join(tmpdir(), "wpt-community-"));
  const mods = join(root, "plugins", "node_modules");
  const mine = join(mods, "magpie-workbuddy-import", "plugin");
  const theirs = join(mods, ...COMMUNITY.split("/"));
  mkdirSync(mine, { recursive: true });
  mkdirSync(theirs, { recursive: true });
  return { root, mods, mine, theirs, self: pathToFileURL(join(mine, "index.mjs")).href };
};

test("找到同一个 node_modules 里的社区插件", (t) => {
  const p = tree();
  t.after(() => rmSync(p.root, { recursive: true, force: true }));
  writeFileSync(join(p.theirs, "index.mjs"), "export const WorkBuddyAuthPlugin = 1\n");

  assert.deepEqual(siblingEntries(p.self), [join(p.theirs, "index.mjs")]);
  assert.equal(candidates(p.self, {})[0], join(p.theirs, "index.mjs"));
});

test("本插件再深一层也找得到", (t) => {
  const p = tree();
  t.after(() => rmSync(p.root, { recursive: true, force: true }));
  const deeper = join(p.mods, "magpie-workbuddy-import-plugin", "plugin");
  mkdirSync(deeper, { recursive: true });
  writeFileSync(join(p.theirs, "index.mjs"), "export const WorkBuddyAuthPlugin = 1\n");

  assert.deepEqual(siblingEntries(pathToFileURL(join(deeper, "index.mjs")).href), [join(p.theirs, "index.mjs")]);
});

// magpie 的目录按它自己的顺序：MAGPIE_CONFIG_DIR，否则 XDG_CONFIG_HOME/magpie
// （官方镜像就是这样：/config），否则 ~/.config/magpie。Docker 里报错就是因为
// 只按 ~/.config 猜，猜到了 /config/home/.config/magpie 这个不存在的地方。
test("配置目录跟 magpie 一样算", () => {
  assert.equal(configDir({ MAGPIE_CONFIG_DIR: "/data/magpie", XDG_CONFIG_HOME: "/config" }), "/data/magpie");
  assert.equal(configDir({ XDG_CONFIG_HOME: "/config" }), join("/config", "magpie"));
  // 相对路径的 XDG_CONFIG_HOME 不算，和 XDG 的规矩一样
  assert.equal(configDir({ XDG_CONFIG_HOME: "relative/cfg" }), join(homedir(), ".config", "magpie"));
});

test("都没有就按配置目录兜底", (t) => {
  const p = tree();
  t.after(() => rmSync(p.root, { recursive: true, force: true }));
  writeFileSync(join(p.theirs, "index.mjs"), "export const WorkBuddyAuthPlugin = 1\n");

  const c = candidates(p.self, { XDG_CONFIG_HOME: p.root });
  assert.ok(c.includes(join(p.root, "magpie", "plugins", "node_modules", ...COMMUNITY.split("/"), "index.mjs")));
});

test("import 得到的是工厂，不是第一个能 import 的模块", async (t) => {
  const p = tree();
  t.after(() => rmSync(p.root, { recursive: true, force: true }));
  writeFileSync(join(p.theirs, "index.mjs"), "export const WorkBuddyAuthPlugin = (ctx) => ({ auth: { methods: [] } })\n");

  const make = await findCommunity({ self: p.self, env: { MAGPIE_CONFIG_DIR: join(p.root, "none") } });
  assert.equal(typeof make, "function");
  const hooks = await make({});
  assert.deepEqual(hooks.auth.methods, []);
});

test("装上了却没有工厂，说的是升级", async (t) => {
  const p = tree();
  t.after(() => rmSync(p.root, { recursive: true, force: true }));
  // 0.2.20 之前的 index.mjs
  writeFileSync(join(p.theirs, "index.mjs"), "export const OpenCodePlugin = 1\n");

  await assert.rejects(
    () => findCommunity({ self: p.self, env: { MAGPIE_CONFIG_DIR: join(p.root, "none") } }),
    (e) => {
      assert.match(e.message, /找不到社区插件/);
      assert.match(e.message, /升级到 0\.2\.20/);
      assert.match(e.message, /index\.mjs/);
      return true;
    }
  );
});

test("没装就给出安装命令，并列出找过的地方", async (t) => {
  const p = tree();
  t.after(() => rmSync(p.root, { recursive: true, force: true }));
  rmSync(p.theirs, { recursive: true, force: true });

  await assert.rejects(
    () => findCommunity({ self: p.self, env: { XDG_CONFIG_HOME: p.root } }),
    (e) => {
      assert.match(e.message, new RegExp(`magpie plugin add ${COMMUNITY.replace(/[/@]/g, "\\$&")}`));
      assert.match(e.message, /找过这些地方/);
      assert.match(e.message, /plugins[\\/]node_modules/);
      return true;
    }
  );
});

// 这条是这次 Docker 报错的复现：插件在 /config/magpie/plugins/node_modules，
// 而 HOME 是 /config/home。以前按 ~/.config 猜，猜不到；现在按邻居找，找得到。
test("镜像里的目录：XDG_CONFIG_HOME 下也能按邻居找到", (t) => {
  const root = mkdtempSync(join(tmpdir(), "wpt-docker-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const mods = join(root, "magpie", "plugins", "node_modules");
  const mine = join(mods, "magpie-workbuddy-import", "plugin");
  const theirs = join(mods, ...COMMUNITY.split("/"));
  mkdirSync(mine, { recursive: true });
  mkdirSync(theirs, { recursive: true });
  writeFileSync(join(theirs, "index.mjs"), "export const WorkBuddyAuthPlugin = 1\n");

  const self = pathToFileURL(join(mine, "index.mjs")).href;
  assert.deepEqual(siblingEntries(self), [join(theirs, "index.mjs")]);
  // 兜底那条也指向同一个地方
  assert.ok(candidates(self, { XDG_CONFIG_HOME: root }).includes(join(theirs, "index.mjs")));
  assert.equal(dirname(dirname(theirs)), mods);
});

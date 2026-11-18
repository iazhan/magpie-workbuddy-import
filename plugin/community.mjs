// 找社区插件 @magpie-community/opencode-workbuddy-auth 的工厂。
//
// magpie 把所有插件装进同一个 plugins/node_modules，所以社区插件通常就是本
// 插件的**邻居**：从本文件所在目录往上走，哪一层的 node_modules 里有它就用
// 哪一个。这一条不依赖任何环境变量，容器里也一样（官方镜像里 magpie 的目录
// 是 $XDG_CONFIG_HOME/magpie = /config/magpie，而 HOME 是 /config/home，
// 按 ~/.config/magpie 猜必然猜错——这就是 Docker 里报“找不到导出”的原因）。
//
// 工厂在包的 index.mjs 里：包的 "." 导出指向 OpenCode 2 的 opencode2.mjs，
// 那里没有 WorkBuddyAuthPlugin（社区插件 0.2.20 起如此），所以按包名 import
// 只当备选，并且要检查拿到的模块真的导出了工厂。

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const COMMUNITY = "@magpie-community/opencode-workbuddy-auth";

/** 工厂所在的文件，相对包目录。 */
export const ENTRY = "index.mjs";

/**
 * magpie 的配置目录，按 magpie 自己的顺序：MAGPIE_CONFIG_DIR，否则
 * $XDG_CONFIG_HOME/magpie，否则 ~/.config/magpie。
 */
export function configDir(env = process.env) {
  if (env.MAGPIE_CONFIG_DIR) return env.MAGPIE_CONFIG_DIR;
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg && isAbsolute(xdg)) return join(xdg, "magpie");
  return join(homedir(), ".config", "magpie");
}

/**
 * 从 self（本插件的入口文件 URL）往上找社区插件，返回它在磁盘上的路径：
 * 越靠近本插件越优先。node_modules 自己也算一层，本插件装在
 * node_modules/magpie-wpt/plugin/ 还是 node_modules/magpie-wpt-import/ 都对。
 */
export function siblingEntries(self = import.meta.url) {
  const out = [];
  let dir = dirname(fileURLToPath(self));
  for (let i = 0; i < 8; i++) {
    const at = basename(dir) === "node_modules" ? dir : join(dir, "node_modules");
    const entry = join(at, ...COMMUNITY.split("/"), ENTRY);
    if (existsSync(entry) && !out.includes(entry)) out.push(entry);
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return out;
}

/**
 * 依次尝试的地方：包名（共享的 node_modules）与按配置目录拼出来的路径。
 * 只用来给错误信息列清单，也方便测试。
 */
export function candidates(self = import.meta.url, env = process.env) {
  const byConfig = join(configDir(env), "plugins", "node_modules", ...COMMUNITY.split("/"), ENTRY);
  const out = siblingEntries(self);
  if (!out.includes(byConfig)) out.push(byConfig);
  return out;
}

/**
 * 社区插件的 WorkBuddyAuthPlugin 工厂。
 *
 * 先按邻居路径找，再按包名 import（会被 "exports" 指到 opencode2.mjs，
 * 检查后就跳过），最后按配置目录拼的路径。找到的模块必须真的导出工厂——
 * 不是第一个能 import 的模块。
 */
export async function findCommunity({ self = import.meta.url, env = process.env } = {}) {
  const tried = [];
  let installedWithoutFactory = false;

  for (const entry of candidates(self, env)) {
    try {
      const m = await import(pathToFileURL(entry).href);
      if (typeof m?.WorkBuddyAuthPlugin === "function") return m.WorkBuddyAuthPlugin;
      installedWithoutFactory = true;
      tried.push(`${entry}（没有 WorkBuddyAuthPlugin 导出）`);
    } catch (e) {
      tried.push(`${entry}（${e?.code || e?.message || e}）`);
    }
  }

  // 包名：node_modules 是共享的时候它才解析得到，且 "." 是 opencode2.mjs
  try {
    const m = await import(COMMUNITY);
    if (typeof m?.WorkBuddyAuthPlugin === "function") return m.WorkBuddyAuthPlugin;
    installedWithoutFactory = true;
    tried.push(`${COMMUNITY}（没有 WorkBuddyAuthPlugin 导出）`);
  } catch (e) {
    tried.push(`${COMMUNITY}（${e?.code || e?.message || e}）`);
  }

  throw new Error(
    [
      `找不到社区插件 ${COMMUNITY} 的 WorkBuddyAuthPlugin 导出。`,
      "",
      installedWithoutFactory
        ? "它装上了，但那个版本没有 WorkBuddyAuthPlugin：升级到 0.2.20 或更高。"
        : "先装它（或升级到能导出该工厂的版本），本插件是挂在它上面的：",
      `  magpie plugin add ${COMMUNITY}`,
      "",
      "装好之后再 magpie plugin add 本插件。",
      "",
      "找过这些地方：",
      ...tried.map((t) => `  · ${t}`),
    ].join("\n")
  );
}

// WorkBuddy 凭据导入 —— 在社区插件的登录方式后面追加一个，不替换它。
//
// magpie 一个供应商只能由一个插件服务（serving），而且「其他登录方式」里
// 能看到的，就是那个插件给出的全部方式。所以想要四种方式同时在，不能各
// 自注册一个插件，也不能接管之后只给一个 —— 只能由同一个插件把它们一起
// 交出去。
//
// 这里做的就是这个：加载社区插件，拿它原样返回的 config / provider /
// auth，只在 auth.methods 末尾追加「导入凭据」。
//
// 社区插件和本插件装在 magpie 的同一个 plugins/node_modules 里，所以从本插件
// 自己的位置往上找它就是最可靠的（community.mjs）；配置文件在哪、HOME 是
// 什么，都不影响。容器里那条路尤其不能按 ~/.config/magpie 猜。

import { findCommunity } from "./community.mjs";

const LABEL = "导入凭据";

export const WorkBuddyPasteLogin = async (ctx) => {
  const make = await findCommunity();
  const hooks = await make(ctx);

  // Nothing is replaced: the browser, desktop and API-key methods stay exactly
  // as the community plugin built them.
  const { authorize } = await import("./paste.mjs");

  return {
    ...hooks,
    auth: {
      ...hooks.auth,
      methods: [
        ...(hooks.auth?.methods ?? []),
        {
          type: "oauth",
          label: LABEL,
          // What magpie asks before authorize() runs. Without this the method
          // starts the moment it is clicked and there is nowhere to put the
          // credential — the field is the whole point.
          prompts: [
            {
              type: "text",
              key: "credential",
              message: "把凭据 JSON、Cookie、请求头或 API key 粘到这里",
              placeholder: '{"account":{…},"auth":{"accessToken":"…","refreshToken":"…"}} / access_token=…; refresh_token=… / ck_…',
            },
          ],
          authorize,
        },
      ],
    },
  };
};

export default WorkBuddyPasteLogin;

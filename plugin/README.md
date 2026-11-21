# magpie-workbuddy-import

在 magpie 的 WorkBuddy 登录方式里追加一个「导入凭据」，同时保留社区插件原有的
browser / desktop / API key 三种方式。

> **仅供交流学习与逆向研究使用。** 本项目只做本地凭据格式转换与登录，不含任何绕过、
> 代理、共享或转售能力。请只用于你自己的账号，使用产生的一切后果由使用者自负。

## 安装

包在仓库根目录，从 npm 或从仓库装都可以：

```bash
# 从 npm：依赖 @magpie-community/opencode-workbuddy-auth 会自动带上
magpie plugin add magpie-workbuddy-import

# 或从仓库：先装依赖（magpie 不替目录装），再装仓库根目录
npm install
magpie plugin add .
```

装完 magpie 会把 `workbuddy` 交给它服务（输出里写 `served by …`）；没接管的话再补 `magpie plugin use magpie-workbuddy-import workbuddy`。

本目录的 `package.json` 标了 `"private": true`，只用来让这个目录能被单独加载；发布以仓库根目录的清单为准。

## 支持的输入

导入窗口接受下列任一形态，不再只认 JSON：

| 形态 | 例子 |
|---|---|
| 凭据 JSON | `{"account":{…},"auth":{"accessToken":"…","refreshToken":"…"}}` |
| 扁平数组 | `[{uid, access_token, refresh_token, expires_at}]` |
| magpie 存储备份 | `plugin-auth.json` 里的单条（`access` / `refresh` / `expires`） |
| Cookie / 请求头 | `access_token=…; refresh_token=…`、`Cookie: …`、`authorization: Bearer …` |
| query / curl | `access_token=…&refresh_token=…`、`curl … -H 'X-API-Key: …'` |
| 浏览器扩展导出 | `[{name:"access_token",value:"…"}]` |
| API key | `ck_…` / `pt_…`，或 `{"key":"…"}` / `{"apiKey":"…"}` / `{"ck":"…"}` |

字段拼法不区分大小写与驼峰/下划线：`accessToken` / `access_token` / `access` / `token`，
`refreshToken` / `refresh_token` / `refresh`，到期时间支持秒、毫秒和 ISO-8601。

## 行为

- **登录前先刷新一次。** 普通凭据会真的拿 refresh token 换一次新 token；换不到就在窗口里
  报错，窗口留着让你改，不会先报成功。
- **API key 不刷新、不预校验。** key 按 magpie 的 `{type:"api", key}` 存，与「WorkBuddy
  API key」登录同一种账号；无效 key 会在第一次真实请求时被拒绝。
- **重复导入会被拒绝。** 已有同 uid 的账号、或同一条 API key，直接拒绝；magpie 自己不去重。
- **Cookie 必须带 token。** 只有 `sessionid=…` 的 Cookie 换不到 token，窗口会说明原因。

## 为什么包在社区插件外面

magpie 一个供应商只能由一个插件提供服务。自己注册插件接管 `workbuddy` 会让社区插件原有
的三个方式整个消失；不接管又调不出自己的方式。所以这里加载社区插件、原样保留它的
config / provider / auth，只在 `auth.methods` 末尾追加第四种方式。

## 本地窗口

`127.0.0.1` 上的临时页面，带一次性 nonce，最多存活 5 分钟；凭据只在内存里过一遍，
不落盘、不外发。只发一个请求：`POST https://copilot.tencent.com/v2/plugin/auth/token/refresh`。

## 卸载

```bash
magpie plugin rm magpie-workbuddy-import
magpie plugin use @magpie-community/opencode-workbuddy-auth@latest workbuddy
```

已登录的账号不受影响。

## 许可

MIT。原项目 © 2026 fenyan5312（[magpie-wpt](https://github.com/fenyan5312/magpie-wpt)），本 fork 的改动 © 2026 iazhan。

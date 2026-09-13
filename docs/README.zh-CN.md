# dsh-erp

[English](https://github.com/GuoMonth/dsh-erp/blob/main/README.md) · [npm](https://www.npmjs.com/package/@guosheng_047/dsh-erp) · [版本发布](https://github.com/GuoMonth/dsh-erp/releases) · [更新记录](https://github.com/GuoMonth/dsh-erp/blob/main/CHANGELOG.md)

在 DeepSeek Harness（DSH）中建立 ERP 菜单地图，将菜单与业务概念关联，并从商品追查库存、采购单和销售单。观察记录、支持证据和可修订知识保存在本机 SQLite 与文件中。

**这是适配指定 SCM/USA 系统家族的只读预览版。** 插件运行在用户本机的 DSH 中。其他 ERP 的自动适配，以及全部页面、Tab、弹窗的自主探索仍在后续计划中。

## 安装与启动

需要以下环境：

| 要求 | 支持范围 |
| --- | --- |
| Node.js | `>=24.18.0 <25` |
| DSH | `0.1.5-rc.2` |
| 桌面 | Linux x64、图形会话和 Chromium 系统库；Windows/macOS 桌面尚未验收 |
| 服务 | 可访问的兼容 SCM 站点，以及已在 DSH 配置的模型；真实 ERP 验收使用 `deepseek-flash` |

已有 DSH 时，将插件安装到 `web` profile：

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.5
dsh web
```

本文对应 **0.1.0-alpha.5**。源码/PR 文档可能先于发布：版本出现在 Releases 后使用下面的 npm 命令；PR 验证请构建并安装当前源码的 TGZ。已经发布的 alpha.4 不包含下面的新配置流程。命令固定到预览版；刚发布后，`alpha` 标签可能经包管理器缓存解析到旧版本。请使用完整 scope 包名：npm 上无 scope 的 `dsh-erp` 属于另一个项目。按需要将 `web` 换成实际使用的 profile。

如果只安装了 Node，npm 可以同时准备固定版本的 DSH 和 pnpm：

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.1.5-rc.2 --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.5
npm exec --yes --package=@deepseek-ai/dsh@0.1.5-rc.2 -- dsh web
```

先在 DSH 中配置模型，再让它使用插件。安装时下载 npm 依赖；首次打开浏览器时，插件准备固定版本的 Chromium。TGZ 包含预编译 JavaScript，用户无需安装 TypeScript、Python、PostgreSQL、Docker 或独立浏览器服务。Linux 缺少浏览器系统库时，仍需用户安装这些库。

也可以下载 [GitHub Release](https://github.com/GuoMonth/dsh-erp/releases) 的 TGZ，将安装命令中的包名替换为该文件的绝对路径。

## 只配置一次 ERP

安装插件后先退出 DSH。在 `~/.dsh/profiles/web/cordis.patch.yml` 中添加下面的条目；设置了 `DSH_HOME` 时，文件位于 `$DSH_HOME/profiles/web/cordis.patch.yml`。如果文件是注释加 `[]`，用下面的配置块替换这个空列表。保留其他条目；已有 `id: erp` 覆盖项时合并 config，不重复添加。把示例地址替换为自己的 ERP 入口，再用 `dsh web` 启动。

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/#/login"
      name: "我的 ERP"
      account: "我的工作账号"
      # tenant: "我的公司"
      # role: "采购"
```

只有 `url` 必填。名称默认取域名，账号别名默认 `default`。这些是知识隔离标签，**不是登录凭据**；切换账号、公司或角色前配置不同别名。本版使用 DSH 已有的 patch 文件，尚未添加 ERP 设置页面或系统切换界面。

入口保留原始路径与 hash，不再拼接固定登录路由。例如入口为 `https://erp.example.com/app/login`，需在 `system` 下另填 `baseUrl: "https://erp.example.com/app/"`。仅当入口路径以 `/` 结尾（例如 `/app/#/login`）时自动推导应用根路径。Base URL 必须以 `/` 结尾，入口必须属于该范围。请使用长期有效的 HTTP(S) 地址，不包含账号密码、查询参数或 hash 内查询参数；临时 SSO 链接不作为配置值，在浏览器中人工完成登录。

**URL 可配置不等于支持任意 ERP。** 商品等业务查询仍依赖下面说明的 SCM/USA 固定适配器。

## 第一次使用与后续对话

全新 DSH 首次启动时，确认预览提示、选择工作区，并在 Settings 中配置模型，然后发送：

```text
先查看我配置的 ERP 系统及已有知识。
打开该 ERP，我会自己登录。等我确认身份和读取授权之后，
先导入全局菜单结构，再解释菜单与商品、库存、采购和销售的关系。
标记缺少名称的入口和尚未访问的页面，保存解释及支持证据。
只执行读取查询。
```

工具流程为 `erp_system_status → erp_scm_connect → 人工登录 → erp_browser_status → erp_scm_enable`。插件打开独立的本机 Chromium 窗口，不接管日常浏览器。密码、验证码或网站提供的扫码登录由人完成；扫码及 SSO 兼容性尚未单独验收。若登录打开多个标签页，完成登录后保留一个位于配置范围内的 ERP 页面，再确认读取。

核对 DSH 授权提示中的账号、公司、角色是否与实际登录一致。没有密码框或存在令牌都不能证明业务身份正确。读取许可最多 10 分钟或 250 次查询；人工接管、导航或会话失效会撤销许可。缺少 SCM 令牌可能表示尚未登录，也可能是系统不兼容，不应因此尝试其他接口或自动登录。

以后新开对话，先调用 `erp_system_status`，复用其返回的精确 `scope`。保持相同配置和数据根目录，知识、证据、已列出的探索任务可以跨重启使用。**查已有知识不需要登录，查实时库存或订单才需要有效登录和当前授权。** 历史观察不能当作当前余额。登录可能过期，读取许可不会跨重启保留。每个插件实例只配置一个系统，根据对话自动选择多个 ERP 是后续能力。

随后可以尝试：

- “查找商品编码 `<编码>`，展示共享库存及关联采购、销售单，并说明扫描了多少订单历史。”
- “只使用已有知识，哪些菜单支持库存业务域？展示证据及观察时间。”
- “把已学知识导出为 Markdown 和 JSON，并列出仍需复核的结论。”

`erp_system_status`、`erp_runtime_status` 和 `erp_storage_status` 分别检查配置、工作进程和存储，不访问 ERP。未配置时，浏览器工具提示如何配置，不接受模型传入的地址。

## 当前能力

| 能力 | 当前行为 |
| --- | --- |
| 菜单地图 | 将当前账号的菜单元数据导入版本化层次，保留缺失名称入口及已退休关系 |
| 业务理解 | 由 DSH 将菜单与业务域、对象和字段关联，保存证据与修订，区分 AI 推断和用户确认 |
| 商品追查 | 通过商品 SKU ID 关联采购、销售单明细；返回商品级（SPU）共享库存、扫描范围及原始单据状态 |
| 学习连续性 | 持久化显式列出的先广后深任务队列、观察和阻塞结果，支持重启恢复 |
| 本地知识 | 搜索、沿关系查询、导出 Markdown/JSON，以及创建一致的 SQLite/证据备份 |

发现菜单元数据不代表访问了每个页面。任务队列保留已列任务，不会自动发现并操作全部 Tab、按钮和多层窗口。

## 适配范围与数据

业务读取采用 `/api/loveinway-admin` 下指定 SCM/USA 接口的固定适配器。浏览器提供登录态及页面观察，API 响应单独记录为 API 证据。本版不自动学习任意 ERP API，也不注册 ERP 业务写入工具。

商品追查每次最多扫描 100 张采购单和 100 张销售单，并明确报告部分覆盖。取消、草稿状态或历史数量不能直接证明实际库存流转；库存对账、退货及单位换算仍需进一步核验。

知识和浏览器数据保存在本机；DSH 使用的观察内容可能发送给用户配置的模型供应商。本地存储不等于 AI 完全离线运行。适配器的登录令牌留在浏览器工作进程内，不进入面向模型的返回结果。DSH 中其他工具和插件仍遵循各自权限。

已有基线使用 Linux x64、真实 DSH、`deepseek-flash` 和一个 SCM 站点，建立了菜单/领域关联，并将商品追查结果与独立读取的订单核对。这不是跨平台或通用 ERP 基准。详见[验收报告](https://github.com/GuoMonth/dsh-erp/blob/main/docs/assessments/2026-09-12-v1-acceptance.md)。

## 系统目录与配置变更

`erp_system_status` 返回实际数据目录。每个应用在插件数据根目录下对应 `systems/<固定ID>/`，包含 `system.json`、`store.sqlite`、`evidence/`、`exports/`、`backups/` 和私有 `browser-profiles/`。URL 查找记录位于 `systems/by-url/`，不会直接把 URL 当成目录名。系统内的知识按账号/公司/角色隔离，浏览器资料也按身份隔离。SQLite 是权威存储，Markdown/JSON 是可读导出，不是另一套可编辑数据库。

改名或在相同 Base URL 下修改登录 hash 保留 ID 和知识；更换应用 Base URL 会建立新系统，改回旧地址可以找回原档案。域名迁移、URL 别名合并和旧数据导入需要后续显式迁移，不能自动猜测。配置变更后重启 DSH，升级时保持数据根目录一致。同一存储只允许一个 DSH 进程持有，不支持多个独立进程同时共享。

## 升级、重启与卸载

升级前，让 DSH 调用 `erp_storage_backup`，再退出 DSH 并重复安装命令，随后重新启动。知识和任务会保留；浏览器登录态与读取许可需要重新检查。

退出 DSH 后，从同一 profile 卸载：

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web remove @guosheng_047/dsh-erp
```

卸载保留知识、证据与浏览器数据。数据目录及恢复步骤见[存储说明](https://github.com/GuoMonth/dsh-erp/blob/main/docs/storage.md)。

**从 alpha.4 或更早版本升级：**更改配置前先用旧配置备份。配置 `system` 后使用新的独立存储；原根目录中的知识保留，但不自动复制或重新归属。未配置 `system` 时，新插件仍可按原 scope 查询、导出和备份旧知识，但不能连接浏览器。需要回看旧数据时，退出 DSH，临时移除 `system` 配置，查询/导出后恢复配置并重启。不要手动移动正在使用的 SQLite/WAL 或修改 scope ID。自动旧数据导入暂缓，详见[系统配置与迁移](https://github.com/GuoMonth/dsh-erp/blob/main/docs/system-configuration.md)。

**从 alpha.1/alpha.2 TGZ 迁移：**先备份并退出 DSH，从 profile 移除旧的 `dsh-erp` 包，再安装 `@guosheng_047/dsh-erp`。两者使用相同插件入口和数据根目录，只启用一个；同时遵循上面的系统存储升级说明。移除旧包时，将上面卸载命令的包名替换为 `dsh-erp`。

## 开发与文档

源码开发需要 Node 24.18+ 及浏览器系统库：

```sh
npm ci --ignore-scripts
npx playwright install chromium --no-shell
npm run verify
npm pack
```

完整测试在本地运行。手动 Release Action 构建 TGZ、发布 npm 并核验对应 GitHub 附件。预演成功不证明 OIDC 发布权限已生效。通过 [GitHub Issues](https://github.com/GuoMonth/dsh-erp/issues) 反馈问题，附版本和复现步骤；公开报告不要包含凭据或私有 ERP 记录。

深入文档：

- [系统配置、本地目录与多 ERP 扩展设计](https://github.com/GuoMonth/dsh-erp/blob/main/docs/system-configuration.md)
- [SCM 查询及会话行为](https://github.com/GuoMonth/dsh-erp/blob/main/docs/scm-readonly.md)
- [知识、证据与修订](https://github.com/GuoMonth/dsh-erp/blob/main/docs/knowledge.md)
- [开发与本地检查](https://github.com/GuoMonth/dsh-erp/blob/main/docs/development.md)
- [发布配置](https://github.com/GuoMonth/dsh-erp/blob/main/docs/npm-publishing.md)
- [后续规划](https://github.com/GuoMonth/dsh-erp/blob/main/docs/v1-plan.md)

## 许可证

[MIT](https://github.com/GuoMonth/dsh-erp/blob/main/LICENSE)。依赖保留各自许可证，见[第三方声明](https://github.com/GuoMonth/dsh-erp/blob/main/NOTICE.md)。Chromium 单独下载。`browser-use` 和 `browser-harness` 是前期调研参考，不是本插件打包的运行依赖。

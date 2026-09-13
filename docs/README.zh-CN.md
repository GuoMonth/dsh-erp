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
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.4
dsh web
```

命令固定到已验证的预览版；刚发布后，`alpha` 标签可能经包管理器缓存解析到旧版本。请使用完整 scope 包名：npm 上无 scope 的 `dsh-erp` 属于另一个项目。按需要将 `web` 换成实际使用的 profile。

如果只安装了 Node，npm 可以同时准备固定版本的 DSH 和 pnpm：

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.1.5-rc.2 --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.4
npm exec --yes --package=@deepseek-ai/dsh@0.1.5-rc.2 -- dsh web
```

先在 DSH 中配置模型，再让它使用插件。安装时下载 npm 依赖；首次打开浏览器时，插件准备固定版本的 Chromium。TGZ 包含预编译 JavaScript，用户无需安装 TypeScript、Python、PostgreSQL、Docker 或独立浏览器服务。Linux 缺少浏览器系统库时，仍需用户安装这些库。

也可以下载 [GitHub Release](https://github.com/GuoMonth/dsh-erp/releases) 的 TGZ，将安装命令中的包名替换为该文件的绝对路径。

## 第一次使用

全新 DSH 首次启动时，先确认预览提示、选择工作区，并在 Settings 中配置模型。然后发送下面的任务，并将占位符替换为站点根地址：

```text
使用 ERP 插件连接 <我的 SCM 站点根地址>。
我会在浏览器窗口中登录。站点、账号、企业和角色使用本地别名，
确保知识保存在正确的范围内。
先导入全局菜单结构，再解释菜单与商品、库存、采购和销售的关系。
标记缺少名称的入口和尚未访问的页面，保存解释及其支持证据。
只执行读取查询。
```

插件打开独立的本机 Chromium 窗口，由人填写密码和验证码。登录后在 DSH 中确认插件的读取许可。许可绑定当前会话与范围，最多持续 10 分钟或 250 次查询。人工接管浏览器或会话失效会撤销许可；重新连接后需要重新检查并确认。

随后可以尝试：

- “查找商品编码 `<编码>`，展示共享库存及关联采购、销售单，并说明扫描了多少订单历史。”
- “哪些菜单支持库存业务域？展示这些关联的证据。”
- “把已学知识导出为 Markdown 和 JSON，并列出仍需复核的结论。”

访问 ERP 前，可让 DSH 调用 `erp_runtime_status` 和 `erp_storage_status` 检查安装。它们返回本机工作进程和存储状态，不访问 ERP。

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

## 升级、重启与卸载

升级前，让 DSH 调用 `erp_storage_backup`，再退出 DSH 并重复安装命令，随后重新启动。知识和任务会保留；浏览器登录态与读取许可需要重新检查。

退出 DSH 后，从同一 profile 卸载：

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web remove @guosheng_047/dsh-erp
```

卸载保留知识、证据与浏览器数据。数据目录及恢复步骤见[存储说明](https://github.com/GuoMonth/dsh-erp/blob/main/docs/storage.md)。

**从 alpha.1/alpha.2 TGZ 迁移：**先备份并退出 DSH，从 profile 移除旧的 `dsh-erp` 包，再安装 `@guosheng_047/dsh-erp`。两者使用相同插件入口和数据目录，只启用一个。移除旧包时，将上面卸载命令的包名替换为 `dsh-erp`。

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

- [SCM 查询及会话行为](https://github.com/GuoMonth/dsh-erp/blob/main/docs/scm-readonly.md)
- [知识、证据与修订](https://github.com/GuoMonth/dsh-erp/blob/main/docs/knowledge.md)
- [开发与本地检查](https://github.com/GuoMonth/dsh-erp/blob/main/docs/development.md)
- [发布配置](https://github.com/GuoMonth/dsh-erp/blob/main/docs/npm-publishing.md)
- [后续规划](https://github.com/GuoMonth/dsh-erp/blob/main/docs/v1-plan.md)

## 许可证

[MIT](https://github.com/GuoMonth/dsh-erp/blob/main/LICENSE)。依赖保留各自许可证，见[第三方声明](https://github.com/GuoMonth/dsh-erp/blob/main/NOTICE.md)。Chromium 单独下载。`browser-use` 和 `browser-harness` 是前期调研参考，不是本插件打包的运行依赖。

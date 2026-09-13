# 浏览器会话与被动观察

本页说明通用人工会话与被动观察。SCM/USA 用户优先使用 [只读版入口](scm-readonly.md)：它会打开登录页并单独确认固定 API 查询许可；与本页被动观察及精确路由实验区分。新增的独立实验入口见 [受控只读导航](controlled-read-navigation.md)，默认未配置，不改变本页人工窗口的操作边界。

本增量推进 #5/#7 的基础接口，并接通“页面观察 → SQLite 证据 → 重启读取”。目标仍为 Node 24.18.0 / dsh 0.1.5 rc2；浏览器基础锁定 Playwright `1.63.0` 和其 Chromium revision `1243`（153.0.8010.12）。通用自动页面探索尚未开放；本次按 Read only 交付，原真实写入计划延期。

## 当前使用流程

1. 先按[系统配置](system-configuration.md)设置 URL 和身份别名，调用 `erp_system_status` 核对。普通用户调用无参数 `erp_scm_connect` 打开配置入口；高级被动模式调用无参数 `erp_browser_open` 打开空白窗口，人工导航。模型不能传入或更换 URL/scope。入口支持 hash，内部 Base URL 无 hash/查询串。
2. 插件启动专用会话，缺少浏览器资源时自动准备；打开后处于人工模式，由用户在本机窗口导航并登录。被动模式保持空白页；普通连接打开配置入口，两者都不自动识别或填写验证码。扫码仅在 ERP 页面本身支持时使用。
3. 登录后调用 `erp_browser_status`，再以返回的 `sessionId` 和 `revision` 调用 `erp_browser_resume`。用户确认当前账号、企业、角色及允许把可见标签作为观察保存并交给已配置模型。
4. `erp_browser_observe` 可在确认有效期间重复被动读取，自动保存观察和 JSON 证据，返回观察 ID、范围、文本和证据哈希。内部学习记录不逐条询问，不执行 ERP 业务操作。
5. 人工操作、导航、框架变化、子窗口或对话框会暂停观察；之后重新核对范围。`erp_browser_takeover` 主动接管，`erp_browser_close` 关闭会话并保留私有 profile。

`resume` 确认仅开启最多 10 分钟的被动观察，不构成后续业务写入批准。确认绑定具体会话与版本，过期或重启不会恢复。没有可用宿主审批通道时，恢复观察拒绝，浏览器仍可用于人工登录；页面内容不能回答宿主审批。

| 工具 | 行为 |
| --- | --- |
| `erp_browser_open` | 准备资源并打开专用窗口；已打开时拒绝隐式切换账号或应用 |
| `erp_browser_status` | 返回控制状态、会话/版本、页面数量和范围内的净化 URL；启动期间可查询 `preparing` 及准备/下载百分比 |
| `erp_browser_resume` | 用户核对范围后启用当前会话/版本的观察，拒绝过期确认和明显登录页面 |
| `erp_browser_observe` | 读取当前唯一页面和应用范围内 iframe 的可见导航、按钮、Tab、标题及字段标签，并保存证据 |
| `erp_browser_takeover` | 阻止新观察、取消并结算在途观察，返回人工模式 |
| `erp_browser_close` | 结算在途观察并关闭浏览器；重启后仍需人工确认 |

当前要求只保留一个页面，多个页面时由人选择并关闭其他页面，不猜测活动窗口。应用范围按同源及路径前缀限制；同源但属于其他应用路径的 iframe 也跳过。改变应用或身份范围需修改用户配置并重启 DSH，profile 按 Base URL 和完整范围隔离。

## 观察内容与证据

DOM 观察器是插件内置的固定函数。可见性检查保留可见同名入口，排除隐藏入口、隐藏子标签、输入值、textarea/select 内容和 `[data-erp-private]` 区域；不会只凭 `menuitem` 角色识别自定义按钮。证据保留主页面 URL、语言、观察时间、会话/版本、frame 序号和 URL、元素本轮序号、标签类型、文本及导航分组。

这些序号只用于本次证据定位，不是稳定菜单身份；当前结果尚未形成父子菜单图，也没有把标签解释为业务规则。frame 逐个采集，不宣称跨 frame 的事务性快照。最多观察 10 个 frame、每 frame 扫描 5,000 个候选并保留 300 项；标签最多 200 字符。证据标注这些界限，超出数量、跳过其他应用 frame 或未探索 Shadow DOM 时另列限制。

页面文本及链接均作为不可信证据，返回内容明确提示不能当作指令或授权。URL 去除查询串及 hash 路由查询串，标签遮盖明显的 password/token/secret/Cookie 等赋值和长令牌样式文本。此规则不能保证发现全部敏感内容：普通姓名、业务名称、路径中的数据仍可能保存并出现在模型上下文中；配置者须按场景设置私有区域并检查证据。不读取 Cookie、密码、输入值、完整表格或截图作为学习内容。

## 会话、资源与恢复

- 浏览器由本地执行工作进程拥有，通过受限 IPC 通信；SQLite 仍在独立线程。未开放远程 CDP 端口、任意脚本或模型提供的选择器。
- `<systemDirectory>/browser-profiles/<范围哈希>/` 保存 Chromium 私有会话。登录态可能位于其中，目录私有；它不进入 SQLite 证据、知识备份或普通错误日志。SQLite 备份不恢复浏览器登录。
- `<systemDirectory>/browser-resources/` 保存版本锁定的 Chromium。使用 Playwright 官方安装器下载和解包，最多等待 10 分钟，显示净化后的阶段/百分比；失败返回 `BROWSER_INSTALL_FAILED_RETRY`，显式重试启动即可。不自行实现下载协议，也不声称已增加独立签名/哈希校验体系。
- 禁用插件或宿主断开时关闭浏览器，保留 profile；异常退出后重新加载不会自动导航或恢复观察确认。已提交观察保留；还在采集阶段的取消结果不入库，已派发的 SQLite 写入按实际结果结算。
- 默认 `browserHeadless: false`、`browserSandbox: true`；需要正常桌面显示环境。启动失败报告显示/资源错误，不静默关闭沙箱或忽略 TLS 证书。
- 可通过宿主配置 `browserResourcesDir` 指定本机资源缓存。`browserHeadless` 和 `browserSandbox` 用于明确的运行环境配置，代理工具不能修改；容器测试显式设为 headless/关闭沙箱，不能据此认定真实桌面默认环境已验收。

用户无需部署浏览器服务或 Python。Linux 缺失浏览器依赖库、企业证书/代理、Windows/macOS 和全新桌面的安装体验仍需 #18 验收；插件不提权安装系统包。实现依据：[Playwright 持久化会话](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)、[浏览器管理](https://playwright.dev/docs/browsers)、[固定版本源码](https://github.com/microsoft/playwright/tree/v1.63.0)。Playwright 使用 Apache-2.0，浏览器发行资源保留上游许可；项目代码仍为 MIT。

## 防护边界与后续工作

被动观察工具不提供自动点击、填表、上传、下载、任意 evaluate 或 CDP 操作。普通连接会导航到用户配置的入口；SCM 固定 API 读取和受审查路线导航另见相应文档。只读指插件开放的操作面；它不是阻止所有网站网络副作用的代理防火墙。人可以在浏览器操作业务，网站自己的脚本也可能发请求；不能仅凭 GET/POST 或本插件标签观察证明网站无写入。Service Worker 当前禁用，但不能据此推断后台请求都被拦截。

人工输入/导航检测是协调机制，不是对恶意页面的强隔离。可见密码框触发 `BROWSER_LOGIN_REQUIRED`，但无密码框不能证明已登录；企业和角色当前由用户确认，无法自动验证站点在后台静默换租户。其他 dsh 插件和宿主任意执行工具也不在本插件的拦截范围。#7 尚未完成，不应据此向真实 ERP 开放自主业务动作。

后续顺序：确认目标角色与独立菜单清单 → 按 #4 对照执行器实际效果 → 完成 #7 的已知只读动作及写入批准边界 → 接 #8/#9/#10 的菜单模型、广度队列和自动探索。当前被动观察为这些任务提供真实页面证据来源。

## 验证记录

2026-09-11，Linux x64 / Node 24.18.0 / Playwright 1.63.0：`npm run verify` 的 42 项测试通过；独立 tarball 消费者及真实 dsh rc2 CLI 均启动/关闭实际 Chromium 空白会话。CLI 使用固定测试模型与审批回答器，未访问真实 ERP。

`tests/browser.test.mjs` 使用真实 Chromium 和本机 HTTP 合成站点：隐藏/重复菜单、同应用 iframe、其他应用 frame 排除、登录页阻断、人工输入与导航、过期确认、弹窗、profile 隔离、Cookie 保留、取消快照、宿主死亡清理均有测试。工具到 SQLite 的捕获测试使用真实浏览器及原生 tools service，人工导航通过仅测试用的进程内适配器完成；真实 IPC 另测启动、范围拒绝及关闭，不把该适配器当作生产导航路径。

`tests/browser-resources.test.mjs` 通过本机假下载源验证坏压缩包拒绝和下载取消，不访问 ERP。实际 Chromium 资源已通过上游安装器下载并启动。带窗口模式另用 `ERP_TEST_HEADFUL=1 xvfb-run -a node --test tests/browser.test.mjs` 验证；这仍是虚拟显示器，不能替代用户桌面、真实扫码、实际 dsh 审批 UI 或独立角色验收。所有浏览器测试在本容器中显式关闭沙箱，产品默认路径未在本环境验证。

# 按已审查契约执行只读导航

2026-09-11，关联 #7/#4。本功能是默认未配置的实验入口，用于验证已知只读页面。它不是通用菜单操作器，不代表 #7 的统一操作授权边界已经验收。

## 行为和边界

人工登录窗口保持原有模式。宿主从本地可信配置读取请求/路由契约，经用户确认完整 scope、契约摘要和范围后，获得 10 分钟、最多 20 次尝试的临时许可。Agent 只能提交契约内的 routeId，不可提交任意 URL、选择器、脚本、HTTP 请求或批准标志。

每次读取创建新的非持久浏览器上下文，只在内存复制同站点 Cookie 和同源 localStorage；不复制 IndexedDB/sessionStorage，不写回人工 profile。加载审查过的路由，采集可见标签，关闭上下文后才返回并保存观察。延迟自动保存逻辑、客户端缓存和页面修改不会迁移回人工窗口；复制 Cookie 仍共用服务端会话，不能据此宣称服务端事务隔离。

请求按路由限定的精确 URL、方法和请求正文匹配，GET/POST 都需事先确认业务语义；未匹配则中止。拦截器禁用 HTTP 重定向跟随及重试，拒绝非 2xx 响应。发往服务器的头只保留受控的 Accept、Cookie 和契约 Content-Type，不转发页面提供的方法覆盖头或 Bearer 头。结果可能因此与真实页面不同，不能把加载失败自动修成扩大权限。

子上下文阻断 WebSocket，禁用 Service Worker，响应附加 CSP 阻止 Worker、插件对象及表单提交。新弹窗、对话框、下载、未知请求和页面崩溃使读取失败；采集期间页面/iframe 导航变化也会丢弃结果；相应尝试不入观察库，后续读取需要重新确认。证据记录契约摘要和 routeId，不记录认证 Cookie。

基础采用 Playwright 的 [BrowserContext 路由](https://playwright.dev/docs/api/class-browsercontext#browser-context-route)、[WebSocket 路由](https://playwright.dev/docs/api/class-browsercontext#browser-context-route-web-socket) 和 [Route.fetch](https://playwright.dev/docs/api/class-route#route-fetch)。官方说明路由不能拦截 Service Worker 接管的请求，因此新上下文明确禁用它，而不是只依赖 HTTP 拦截。当前验证覆盖上述 HTTP/页面路径；没有操作系统网络隔离，未验证 WebRTC 等所有浏览器传输，不宣称网络安全沙箱。

## 可信契约的来源

契约必须来自对具体版本的应用接口/实现与服务端权限的核实。`reviewBasis` 记录依据，但代码不验证这段说明是真是假。模型可以辅助分析；不能把学习到的请求、菜单名称、页面注释、GET 方法或一次成功访问直接当作只读证据。

**关键反例已测试：**如果把会写入的 GET 误放进只读契约，服务器仍会被修改。请求匹配、临时上下文和用户确认都无法修复错误的业务分类。真实 ERP 启用前需要服务端只读权限和独立核对，不能将此模式默认开放给现有管理账号。

配置文件不由插件 Agent 工具写入或扩充。宿主其他文件/代码工具和恶意同机插件不在此保护范围内；有能力改宿主代码或配置的主体属于信任边界，不能据此关闭 #7 的全通道审查。

## 配置示例

在 dsh 插件 patch 中设置绝对本地文件路径；普通被动观察无需此设置：

```yaml
- id: erp
  config:
    browserReadPolicyFile: /absolute/local/path/reviewed-read-policy.json
```

先按[系统配置](system-configuration.md)建立档案，再调用 `erp_system_status`。下面仅为不可访问的合成地址示例，不是任何真实 ERP 的只读规则。实际契约的 siteUrl 必须复制状态中的 baseUrl，scope 必须完整复制返回值（包括固定系统 ID），不能使用示例中的 fixture。将上述路径配置合并到同一个 erp 条目。

```json
{
  "format": 1,
  "id": "reviewed-demo-v1",
  "siteUrl": "https://example.invalid/erp/",
  "scope": { "site": "fixture", "account": "reader", "tenant": "demo", "role": "reader" },
  "reviewBasis": "填写独立核对的应用版本、只读接口依据和服务端权限证据",
  "requests": [
    { "id": "orders-html", "url": "https://example.invalid/erp/orders", "method": "GET", "body": "", "contentType": "" },
    { "id": "orders-query", "url": "https://example.invalid/erp/query", "method": "POST", "body": "{\"status\":\"pending\"}", "contentType": "application/json" }
  ],
  "routes": [
    { "id": "orders", "label": "Orders", "url": "https://example.invalid/erp/orders", "requests": ["orders-html", "orders-query"] }
  ]
}
```

规则没有通配符，最多 50 个路由、200 个请求定义，文件不超过 128 KB；URL 必须处于同一应用范围。静态资源和数据请求也必须列入。文件中不要放真实密码、令牌、Cookie 或敏感查询数据。文件缺失/格式错误/范围不同均不放行。

## 工具流程

1. 确认 `erp_system_status` 后，无参数调用 `erp_browser_open` 打开人工窗口，用户在配置范围内导航并登录。
2. `erp_browser_read_policy` 查看可信契约及 digest；`erp_browser_status` 取得当前 sessionId/revision。
3. `erp_browser_read_enable` 提交 sessionId、revision、policyDigest，经宿主确认后取得新的 revision、到期时间和尝试预算；不需要先做一次被动 resume。
4. `erp_browser_read` 提交许可中的 sessionId/revision/policyDigest 和 routeId；成功返回已入库观察，可交给现有知识工具解释、关联和查询。
5. 原窗口人工输入/导航、接管、再次被动 resume、重启、到期、预算耗尽或契约变更后，旧许可不再可用。失败消耗尝试数，不自动重试；重新加载策略需要新的确认。

单次读取最多 200 个匹配请求，有 12 秒总期限，页面加载等待至多 10 秒。网络短暂安静只是取样时机，不是业务完成或页面完整性证明。没有自动识别企业切换或角色变化；人工确认的 scope 仍不是服务器核验的身份。

取消测试覆盖新页面创建期间、请求已经到达测试站之后及人工接管。修复了取消与 Chromium 创建页面的竞态：取消不等待可能悬挂的新页面命令，但返回前等待所拥有的临时上下文关闭。已发送的可信只读请求不能撤回，不将取消描述为“服务端一定未收到请求”。

## 验证和适用范围

本地完整 `npm run verify` 已通过 58 项测试及安装产物/真实 dsh CLI 冒烟。8 项受控导航专项的合成测试验证已审查 GET/POST、响应标签、状态不回写，以及自动保存、写入型 GET、改正文、iframe、弹窗、WebSocket、Worker、重定向、对话框、登录过期、许可失效、取消和原生确认。失败不存入成功观察。另保留“错误只读契约仍导致写入”的反例，明确机制无法证明业务语义。

原生确认与入库测试连接真实 BrowserSession 和 SQLite；工作进程 IPC 检查契约传输与缺许可拒绝。真实 dsh CLI 冒烟检查安装及现有工具；尚未通过真实 CLI 在目标 ERP 完成获批导航。其他平台、真实模型和目标 ERP 效果仍未验收。

这是已知页面的读取/对照工具。纯点击状态路由、动态 Tab、需 sessionStorage/IndexedDB 或 Bearer 认证、跨域资源、服务端刷新登录态、依赖 Worker 的 SPA 都可能不兼容。必须通过真实任务评估再扩大适用范围；不把人工维护请求清单变成普通用户首装的默认要求。

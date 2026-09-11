# 开发与本地验证

目标为 dsh `0.1.5-rc.2`，对应上游标签 `dsh-v0.1.5-rc.2`。当前验证基线 Node `24.18.0`，运行时要求 `>=24.18.0 <25`；后续 Node 24 安全更新需经过检查再推进基线。项目使用 npm 锁文件，不需要全局 TypeScript、Python 或数据库。

```sh
npm ci --ignore-scripts
npx playwright install chromium --no-shell
npm run verify
npm pack
```

`verify` 包含类型检查、生命周期/协议/宿主服务测试及安装产物冒烟。开发依赖包含目标 dsh CLI 和 pnpm；插件产物仅包含预编译 JavaScript、声明文件、bundle patch、README 和许可证，不含测试适配器。第一次验证需要联网获取 registry 依赖，不是离线构建。

## 在已有 dsh 中加载

当前产物提供连接诊断、SQLite 和浏览器被动观察；自动探索、业务知识模型与写入操作尚未开放。打包后，在装有目标 dsh 的机器上执行：

```sh
dsh plugin --profile headless add /absolute/path/dsh-erp-0.1.0-dev.0.tgz
dsh --profile headless "调用 erp_runtime_status 检查本地工作进程"
```

dsh 的对话使用用户已有的模型配置。上述 profile 可换成用户实际使用的 profile，不建议把测试配置覆盖进日常 profile。`dsh plugin` 在 rc2 内部调用 pnpm；若机器只有 Node 与 dsh，可由 npm 临时准备明确版本的 pnpm：

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile headless add /absolute/path/dsh-erp-0.1.0-dev.0.tgz
```

自动化冒烟在隔离的 `DSH_HOME` 中通过已安装的 pnpm 验证真实 CLI 安装命令；上面的临时获取方式及其他平台需要在 M5 干净环境矩阵中进一步验证。不能据此宣称已经完成全部单机分发体验。

上面的 Chromium 安装命令用于开发测试预备缓存；安装后的插件会在首次打开浏览器时自动准备锁定资源，不要求用户部署浏览器服务。Linux 缺少系统库时需先准备 Playwright 所需系统依赖（CI 使用 `npx playwright install --with-deps chromium --no-shell`）；插件不自动提权安装系统包。普通使用默认启动本机窗口，具体工具及配置见 [浏览器观察说明](browser-observation.md)。

## 诊断入口

| 工具 | 行为 |
| --- | --- |
| `erp_runtime_status` | 懒启动本地工作进程，返回 Node 版本、协议版本和 PID；不访问 ERP |
| `erp_storage_status` | 懒启动存储线程，检查/创建本地 SQLite，返回版本、锁模式及记录数；不访问 ERP |
| `erp_model_probe` | 使用指定的已有 dsh provider/model 路由发出固定连接测试；有模型调用成本，不发送 ERP 页面数据 |
| `erp_approval_probe` | 对无副作用的诊断触发宿主审批；无 Agent 或不可用审批通道时拒绝，不批准后续业务操作 |

模型诊断的 provider/model 是已有宿主路由，不是新的密钥配置。普通使用无需主动运行模型或审批诊断。`ctx.erp.diagnostics()` 提供内存中的最近 100 条运行元数据、模型调用数、耗时和已上报的输入/输出 token；不记录模型原文或请求 payload，不等同于持久审计或完整费用统计。

## 生命周期与恢复

宿主插件持有工作进程及待完成模型调用。IPC 使用版本、随机请求 ID 和固定操作契约，参数与响应经目标 dsh 原生 Schema 校验；不提供任意脚本、网络或 CDP 执行入口。

工作进程同一时刻处理一个请求，忙时明确拒绝。调用取消或超时先发送取消消息，未协作结束时终止进程，等待退出后才返回；崩溃使当前调用失败，下一次显式调用可重建工作进程，不重放旧请求。插件禁用/卸载中止工作及模型调用，等待清理；宿主断开 IPC 后工作进程退出。模型适配器须遵循 dsh 的取消协作契约，插件无法强杀宿主内任意失控代码。

工作进程仅继承必要系统环境，不继承模型凭据、`NODE_OPTIONS` 或宿主的 preload 参数。这是职责隔离，不能当作对恶意同机插件的安全沙箱。后续浏览器自动化必须等待 [Issue #7](https://github.com/GuoMonth/dsh-erp/issues/7) 的统一业务授权边界完成。

SQLite 使用另一条存储线程，执行进程的取消或终止不终止存储线程。插件卸载会等待已接收的持久化操作结算并关闭连接，不删除数据。存储取消、迁移失败与离线恢复的具体语义见 [存储说明](storage.md)。

## 真实 ERP 验证

测试适配器是测试替身。`npm run smoke` 用真实 dsh CLI、代理循环、工具管线和审批服务检查安装产物，模型由固定测试适配器回答；不会连接线上模型供应商或 ERP。

真实 ERP 任务遵循 [验收环境与样本](testing/README.md)。目标站点已完成独立登录探测；角色、独立菜单清单及可复位数据尚待确认，不关闭 [Issue #2](https://github.com/GuoMonth/dsh-erp/issues/2)。当前浏览器能力只有本地合成站点证据，不能据此声称真实 ERP 全局认知或业务安全已验证。

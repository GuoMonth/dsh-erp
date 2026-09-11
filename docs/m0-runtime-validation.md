# M0 插件运行基础验证

日期：2026-09-11。关联 [Issue #3](https://github.com/GuoMonth/dsh-erp/issues/3)；本记录描述当前开发骨架，不代表 M0 全部任务或首版产品已经完成。

## 环境与版本

- Linux x64，Node `24.18.0`，npm `11.16.0`。
- `@deepseek-ai/dsh`、`dsh-tools`、`dsh-llm` 等宿主包固定 `0.1.5-rc.2`，Cordis 固定 `4.0.2`；完整依赖由 `package-lock.json` 锁定。
- 官方版本依据：[dsh rc2 标签](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.5-rc.2)。实现对照 [原生工具接口](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/docs/subsystems/tools.md) 和 [插件生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/docs/cordis-tutorial/02-lifecycle-and-effects.md)，并以已安装目标包的实际类型及行为验证。

## 复现步骤

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium --no-shell
npm run verify
```

当前本地结果：类型检查通过；58 个测试全部通过（含 14 个存储、8 个知识、11 个浏览器/资源及 8 个受控导航专项测试）；从 tarball 安装的独立消费者与真实 dsh CLI 冒烟均通过。GitHub Actions 检查流程已配置；远端结果以对应提交的 PR 检查为准，不将本地结果视为远端 CI 已通过。合成知识写入、原生查询及恢复也已通过，详见 [知识说明](knowledge.md)；SQLite 的具体边界与基准见 [存储说明](storage.md)，浏览器的测试方式和限制见 [浏览器说明](browser-observation.md)。

| 验证点 | 结果与证据来源 |
| --- | --- |
| 原生工具参数、返回值与卸载 | `tests/plugin.test.mjs` 经真实 rc2 tools service 执行；无效参数在调用模型前失败 |
| 工作进程往返 | 父子 PID 不同，固定版本 IPC 请求/响应通过校验 |
| 取消、超时及不可协作工作进程 | 协作取消可复用通道；不协作时终止进程且等待退出 |
| 崩溃及恢复 | 在途调用失败，后续显式调用建立新进程，不自动重放 |
| 禁用、重新加载与宿主退出 | 工具移除、重载建立新进程；直接杀死宿主后工作进程退出 |
| 凭据与启动参数隔离 | 测试环境哨兵、`NODE_OPTIONS` 及 preload 参数未继承到工作进程 |
| 模型服务 | 固定测试适配器经过真实 `ctx.llm.stream`；失败返回失败，卸载中断并等待在途调用结束 |
| 宿主审批 | 允许一次、拒绝与无 Agent 的拒绝均验证；检查宿主 `approval/asked` / `approval/decided` 审计事件 |
| 产物安装 | 独立临时消费者从 tarball 安装；发布文件含 JS 与声明，不含测试适配器或 TypeScript 实现源码 |
| 存储集成 | 产物含独立存储线程；真实 tools service 调用存储诊断，写入合成观察、备份并在新目录恢复；执行进程取消不影响存储 |
| 浏览器集成 | 实际 Chromium 在合成站点验证观察、人工接管、范围变更和会话恢复；安装产物经真实 IPC/CLI 打开空白专用会话并关闭 |
| 真实 dsh CLI | 隔离 `DSH_HOME` 内执行 `dsh plugin --profile headless add`，bundle 自动关联；真实代理循环依次调用诊断工具并正常退出 |

完整 CLI 冒烟使用确定性测试模型，测试审批回答器只允许无副作用审批探针，代码位于 `scripts/fixture-provider.mjs`，不随插件发布。模型供应商网络、实际用户审批 UI、真实 ERP 页面和业务结果不在本轮验证内。容器无法启用 Chromium 沙箱，测试显式关闭；产品默认启用且失败不自动降级。

## 发现与实现选择

1. 目标宿主已提供工具参数及返回值校验，IPC 也复用原生 JSON Schema 校验；本阶段不引入 Zod 或第二套工具契约。
2. dsh rc2 的插件安装命令转调 pnpm。开发验证固定 pnpm `11.7.0` 并提供在命令 PATH 中；仅 Node+dsh 的最终分发体验仍需自动准备这项依赖。
3. 外部工作进程使用 Cordis effect 清理。卸载时还需要中止并等待插件发起的模型请求，不能只移除工具注册。
4. Node 版本在实际加载入口与工作进程中校验，不只依赖 package engines。发布包不用编译 TypeScript。
5. 运行诊断保留有界内存元数据；SQLite 已持久化观察、证据引用和任务检查点，提供一致性备份与迁移。模型调用统计与业务授权审计尚未持久化，知识版本演进属于后续业务模型任务。

## 未完成与验收边界

- Issue #2：已有登记模板及固定任务集，目标站点已完成独立登录探测；角色、领域和可复位数据尚待确认，独立完整菜单清单及真实任务基线未采集。
- Issue #3：运行骨架与本地技术验证已完成，随本次变更提交审阅；真实供应商模型连接与交互审批界面验证尚未完成。本轮不关闭 Issue。
- Issue #6：SQLite 基础、可恢复迁移与一致性备份已通过 PR #21 合并。Issue #5/#7 已推进专用会话、范围确认与被动观察基础；浏览器执行器对照、真实 ERP 会话验收、自动动作和统一业务写入授权仍未完成，不关闭 #4/#5/#7。
- 未实现页面学习、知识图谱、查询能力或 ERP 写入；不作任何业务安全效果承诺。
- 支持平台仅有本轮 Linux x64 证据；Windows/macOS、桌面内嵌运行时、企业代理/证书、升级及卸载数据选择留给各任务验收。
- 模型诊断的 token 统计采用宿主上报口径（输入为非缓存输入），没有费用价格换算；不是全会话成本报表或持久审计。

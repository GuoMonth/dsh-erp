# DSH 0.1.6-alpha.2 对齐验证

日期：2026-09-19；基准 main 86624d82377e802dda30ec3c5e24d94a842d319f；任务：[跨仓库 Issue #24](https://github.com/GuoMonth/dsh-deskwork/issues/24)。

## 版本与运行边界

目标宿主固定 **DSH 0.1.6-alpha.2（预发布）**，对应[官方发布](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.6-alpha.2)。当日 npm alpha 为此版本，latest/next 仍为 0.1.5-rc.2。peer/devDependencies、运行诊断、安装指南和发布说明生成器统一标记精确版本，lockfile 全部 250 个 DSH 条目均为此版本。

新 DSH 将插件 peer 解析留在宿主进程。原生 CLI 安装 TGZ 后，ERP 独立工作进程无法继承该解析器，首次 health 调用报 WORKER_EXITED；诊断确认 ERR_MODULE_NOT_FOUND: @deepseek-ai/dsh-tools。普通 npm 消费者及仓库内测试不能暴露此问题。

新增 schema-runtime 模块，仅导出上游 validateJsonSchemaValue/valueSchemaSpecToJsonSchema，构建时用 esbuild 将其依赖嵌入一个本地 ESM 文件。工作进程和存储线程无需宿主 peer 解析器即可使用同一版本校验规则；不复制实现、不传递凭据/预加载环境、不改变宿主工具服务。产物约 272 KiB，构建生成并随包保留相关依赖的完整 MIT 许可证。真实 CLI 冒烟覆盖了此前失败的安装路径。

## 验证结果

Linux x64；Node 24.21.0；npm 11.19.0；Playwright 1.63.0；Chromium 153.0.8010.12。使用隔离的临时 DSH_HOME、临时 SQLite 和合成 ERP；测试模型为固定适配器。浏览器测试复用本机账号隔离，显式关闭 Chromium sandbox；有界面检查使用 Xvfb。

- `npm run verify`：类型检查、构建、75 项测试全部通过；独立 TGZ 消费者及真实 DSH CLI 安装、Agent 工具回合、IPC、模型服务、审批、SQLite、知识保存/检索、浏览器学习和退出清理通过。
- 增加许可证生成和包文件断言后，`npm run smoke` 再次通过；生成产物含 schema-runtime.js 和完整许可证文件。
- `ERP_TEST_HEADFUL=1 xvfb-run -a node --test tests/browser.test.mjs tests/read-navigation.test.mjs tests/scm-learning.test.mjs`：22 项通过，覆盖可见窗口会话、确认、读路径、接管与历史 SCM 回归。
- 首次验证缺少 Chromium；完成固定浏览器资源准备后重新验证。未以该环境失败改动业务逻辑。

## 未覆盖项

未发布新 npm 版本，安装指南使用本分支 TGZ；已发布 alpha.7 不是本轮升级产物。未接入 DSH Browser Use/Computer Use，现有 Playwright 路径保持不变。未调用真实模型或 ERP，未验收 macOS/Windows，也未进行与 Deskwork 的业务联调。

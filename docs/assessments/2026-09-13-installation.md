# 2026-09-13 npm 首次安装评估

结论：已配置模型的 DSH 用户可以用安装命令添加插件，再手动登录已适配的 SCM 网站。只有 Node 的用户也能通过 npm exec 准备 DSH 和 pnpm，但首次仍要完成宿主的预览提示、工作区选择与模型配置。本版不是无需配置的通用 ERP 产品。

## 发布结果

PR #29 已合并；`@guosheng_047/dsh-erp@0.1.0-alpha.4` 已通过 [Trusted Publishing Action](https://github.com/GuoMonth/dsh-erp/actions/runs/34752864523) 发布，Token 发布步骤跳过，OIDC 和 provenance 成功。GitHub Release 的 TGZ 与 npm registry 的字节校验通过。TGZ SHA256：`955c9496e1ebcf95e7b57d36d31cc142312c8cc4b2b7bdf63f5980cc53e3bc1a`。

GitHub npm-release Environment 的一次性 NPM_TOKEN Secret 已移除。npm 账号内原临时 Token 的撤销由账号持有人完成。

## 用户路径验证

- 在独立工作目录、DSH_HOME 和初始为空的 npm cache 中，从 PATH 移除已有 DSH、pnpm，仅保留 Node 和系统命令，运行 README 的 npm exec 安装方式。
- `@alpha` 的一次安装实际得到 alpha.3。公开 registry 的 alpha 已指向 alpha.4，但 pnpm 解析仍可能经过其他缓存或版本策略；未确定具体来源。改用精确 `@0.1.0-alpha.4` 后确认安装版本正确，因此推荐命令改为固定版本。
- 直接从 npm 获取 DSH rc2 和 pnpm，安装 web profile，检查包版本和 bundle 注册；无需全局安装 pnpm，不编译插件源码。
- 启动真实 DSH Web。为避免端口冲突和打开系统浏览器，探测额外使用 `--port 0 --no-open`。通过浏览器加载真实前端，观察到预览提示、Settings 和工作区选择入口。未在本次环境中完成真实模型配置或 ERP 登录。
- 独立 registry TGZ 消费者与真实 DSH CLI 固定模型冒烟通过：工具注册、执行进程、审批探针、SQLite/恢复、知识记录/查询/导出、空白 Chromium 会话及宿主退出清理。从 registry 安装和卸载均通过。
- 附加 Settings 页面点击探测未形成稳定完成证据，不将其算作完整 Web 交互验收；首次页面加载不等于已验证所有宿主配置界面。

本轮使用 Linux x64 / Node 24.18.0；复用已有 Linux 系统库和 pnpm store，不能宣称全新操作系统验证。测试用浏览器及固定模型冒烟在容器中显式关闭浏览器沙箱，产品默认仍启用。Windows/macOS 桌面和本轮真实模型/ERP 在线链路未重复验证；此前业务结果见 2026-09-12 验收报告。

## 首次使用需要用户完成的步骤

1. 准备支持的 Node 24 与本机图形环境；已有 DSH 时确认版本为 rc2。
2. 安装插件并启动 DSH。全新 DSH 中确认预览提示、选择工作区、配置模型。
3. 给出兼容 SCM 站点根地址与任务，让插件打开本机浏览器。
4. 在浏览器手动登录，在 DSH 中确认绑定当前会话的读取许可。

无需 Python、PostgreSQL、Docker、TypeScript 或独立浏览器服务。Chromium 首次准备需要网络；Linux 缺少系统库仍需补齐。当前兼容性限于已适配 SCM/USA 接口，不承诺任意 ERP 自动适配。

## 分发文档问题

alpha.4 TGZ 内英文 README 和简体中文文档均存在，打包时的 npm 元数据读取选择英文 README。公开 registry 顶层 readme 多次读取仍为空，npmjs 页面展示未独立确认；单独记录为 [Issue #30](https://github.com/GuoMonth/dsh-erp/issues/30)。GitHub 中英文文档可访问，此项不阻塞包安装或已验证功能。

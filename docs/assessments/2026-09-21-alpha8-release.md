# alpha.8 发布验证

2026-09-21，基于 main d8a8f22071faaf1c2ae8452eeaf7f90e617395f7。发布 @guosheng_047/dsh-erp 0.1.0-alpha.8，交付已合并的 DSH 0.1.6-alpha.2 精确锁定、独立 worker schema 打包和许可证修复。更新版本、CHANGELOG 和 npm 安装指南；没有新增运行行为或 Browser Use 集成。

Linux x64、Node 24.21.0、npm 11.19.0：

- `npm run verify` 通过：类型、构建、75 项测试、仓库外 TGZ 消费及真实 DSH 0.1.6-alpha.2 CLI 安装/工具/审批/SQLite/知识/Chromium/退出清理。
- `ERP_TEST_HEADFUL=1 xvfb-run -a node --test tests/browser.test.mjs tests/read-navigation.test.mjs tests/scm-learning.test.mjs`：22 项通过。
- 现有锁文件250个DSH包均0.1.6-alpha.2；本次仅变更根包版本。

使用合成页面和受控模型、临时DSH_HOME及SQLite；测试按已有host隔离约定禁用浏览器sandbox。未调用真实模型或真实ERP，未新增跨平台验收。

发布通过现有手动Release Action，从合并后的main构建。工作流校验npm registry TGZ字节与GitHub附件；本记录仅声明上述本地验证，不预先宣称发布完成。发布结果以 v0.1.0-alpha.8 Release 和 Action 为准。

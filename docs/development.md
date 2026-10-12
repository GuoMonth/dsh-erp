# 开发

[English](development.en.md) · [指南目录](index.zh-CN.md)

使用 [.nvmrc](../.nvmrc) 和 [package.json](../package.json) 固定的 Node、npm 版本。DSH 依赖与 `DSH_TARGET` 锁定同一上游 RC；更改时同步锁文件和两种语言。

## 检查

```sh
npm ci --ignore-scripts
npx playwright install chromium --no-shell
npm run verify
npm pack
```

`verify` 执行类型检查、测试和安装产物冒烟。冒烟在仓库外安装 TGZ，以确定性模型检查真实 DSH、Chromium、IPC、审批和本地知识，不调用在线模型或 ERP。构建清理 `dist`，发布包排除测试夹具和用户私有数据。

浏览器变更补充相关的有界面测试：

```sh
npm run build
ERP_TEST_HEADFUL=1 xvfb-run -a node --test tests/browser.test.mjs tests/read-navigation.test.mjs tests/scm-learning.test.mjs
```

SCM 夹具是冻结的回归基准，不是生产集成。原生桌面变更可运行下列可选测试，只控制隔离的夹具窗口：

```sh
ERP_CUA_DESKTOP_E2E=1 xvfb-run -a -s '-screen 0 1920x1080x24' node --test tests/computer-desktop.integration.mjs
```

文档变更检查链接、锚点和翻译，无需运行完整运行时测试。PR 记录实际命令、源码身份和未测范围。真实模型视觉、用户 macOS 和当前真实 ERP 业务验收仍待完成。[历史评估](assessments/)只适用于各自日期和版本，新业务验证按[测试指南](testing/README.md)准备。

## 本地安装包

使用唯一 TGZ 路径并核对安装字节，pnpm 可能缓存复用的路径。在隔离的 DSH profile 中安装：

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web add /absolute/path/guosheng_047-dsh-erp-0.1.1.tgz
```

`erp_runtime_status`、`erp_storage_status` 检查本地进程与存储；`erp_model_probe` 调用已有模型路由，`erp_approval_probe` 检查无副作用审批，均不批准后续业务操作。完成本地验证后，通过手动 [Release Action](npm-publishing.md) 发布。

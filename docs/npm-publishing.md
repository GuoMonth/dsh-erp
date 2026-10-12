# 发布到 npm 与 GitHub

[English](npm-publishing.en.md) · [指南目录](index.zh-CN.md)

包名为 `@guosheng_047/dsh-erp`。所有版本发布到 npm `latest`；Alpha/Beta/RC 在 GitHub 保留预发布标记。无 scope 的 `dsh-erp` 属于其他项目。

## 发布

1. 完成[本地检查](development.md#检查)，更新版本、锁文件、更新记录和两种语言的用户指南，将评审后的变更合并到 `main`。
2. 在 `main` 运行 [Release npm package](https://github.com/GuoMonth/dsh-erp/actions/workflows/release.yml)，填写精确版本。`dry_run=true` 用于检查构建与打包。
3. 正式发布设置 `dry_run=false`、`auth=trusted`。工作流发布带 provenance 的同一 TGZ，核验 registry 字节，再创建 tag 和附带 TGZ、校验值的 GitHub Release。
4. 核对 Release 与 npm 标签，记录源码提交和验证结果。

Action 仅手动触发，负责构建和产物检查；行为由本地测试验证。发布包排除测试夹具、验收答案、数据库、观察和登录资料。

## 重试

工作流拒绝 `latest` 倒退、同版本不同字节、源码 tag 或附件冲突。部分成功后从原提交、原产物重试，不以同版本发布修改后的内容。registry 传播最多等待约 2.5 分钟，不重复发布。

## Trusted Publisher

当前包使用 GitHub OIDC，npm 绑定如下：

| 设置 | 值 |
| --- | --- |
| Organization or user | GuoMonth |
| Repository | dsh-erp |
| Workflow | release.yml |
| Environment | npm-release |

Action 的 `contents: write` 用于 tag/Release，`id-token: write` 用于 OIDC，无需长期 npm Token。`bootstrap-token` 仅保留用于创建新包，对当前已存在的包会被拒绝。详见 [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)。

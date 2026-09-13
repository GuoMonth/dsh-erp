# npm 首次发布

包名：`@guosheng_047/dsh-erp`，首个 npm 版本准备为 `0.1.0-alpha.3`，公开访问，dist-tag 为 `alpha`。npm 上无 scope 的 `dsh-erp` 不属于本仓库。当前文件描述待执行流程，不代表 npm 已发布成功。

## 本地认证

用 `guosheng_047` 登录 npm，创建短期 Granular Access Token。Packages and scopes 选择 `Read and write (publish and stage)`，范围限定 `@guosheng_047`；新包尚不存在，需要 scope 权限。勾选 `Bypass two-factor authentication` 以允许本次非交互发布，Organizations 选择 `No access`，有效期建议 1 天。权限说明见 [npm 文档](https://docs.npmjs.com/creating-and-viewing-access-tokens/)。

在当前开发机的交互终端、仓库根目录运行：

```sh
bash scripts/configure-npm-auth.sh
```

提示出现后粘贴 Token 并回车，输入不显示。脚本只配置认证，不发布；写入 `$HOME/.config/dsh-erp/npmrc`，文件权限 600、目录权限 700，不修改全局 `.npmrc`。该文件在仓库外，不进发布包。后续 npm 命令通过 `--userconfig "$HOME/.config/dsh-erp/npmrc"` 显式使用它，不输出内容。

已有环境注入工具也可把 Token 注入 `DSH_ERP_NPM_TOKEN` 后运行同一脚本。仅在另一个终端 `export` 不会改变现有代理进程的环境；脚本保存到专用文件后，发布进程才可读取。不要把 Token 放进命令行参数或提交到 Git。

## 发布流程

本地运行 `npm run verify` 以及开发说明中的有界面测试。构建后打包，核对包名、版本、bundle、文件清单及 SHA256，提交发布来源，再发布已核对的 TGZ：

```sh
npm publish /absolute/path/guosheng_047-dsh-erp-0.1.0-alpha.3.tgz \
  --userconfig "$HOME/.config/dsh-erp/npmrc" \
  --registry https://registry.npmjs.org --access public --tag alpha --ignore-scripts
```

发布后检查 registry 版本与 `alpha` 标签、下载产物并核对内容，再通过 DSH 安装 registry 版本验证。记录实际结果后，将文档中的待发布状态改为已发布。同版本内容不可覆盖；旧 GitHub Release 资产不修改。本地 Token 发布不宣称具备 OIDC provenance。

首次发布完成后，可以撤销临时 Token 并删除这个专用 npmrc。后续可单独配置 npm Trusted Publisher，绑定 `GuoMonth/dsh-erp` 的手动发布工作流；不会自动继承 `dsh-multi-tenant` 的授权，也不需要恢复每次 push/PR 的 CI。

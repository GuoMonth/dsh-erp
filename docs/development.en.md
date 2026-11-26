# Development

[简体中文](development.md) · [Guides](index.md)

Use the Node and npm versions in [.nvmrc](https://github.com/GuoMonth/dsh-erp/blob/main/.nvmrc) and [package.json](../package.json). DSH dependencies and `DSH_TARGET` pin the same upstream RC; keep the lockfile and both languages in step when changing it.

## Checks

```sh
npm ci --ignore-scripts
npx playwright install chromium --no-shell
npm run verify
npm pack
```

`verify` runs documentation checks, type-aware Oxlint, separate TypeScript checks for the host and client, Vitest, and artifact smoke. Use `npm test -- tests/<name>.test.mjs` to select a suite. [Repository conventions](https://github.com/GuoMonth/dsh-erp/blob/main/AGENTS.md) cover TypeScript and tests. Tests cover the desktop client bundle, the ERP 助手 entry, resume and bookmark validation, index presentation, and separate indexes when two sites are switched. Smoke installs a tarball outside the repository and exercises real DSH, Chromium, IPC, approvals and local knowledge with a deterministic model. It does not call a live model or ERP. The build cleans `dist`; packages exclude fixtures and private user data.

For browser changes, run the affected headful tests:

```sh
ERP_TEST_HEADFUL=1 xvfb-run -a npm test -- tests/browser.test.mjs tests/read-navigation.test.mjs tests/scm-learning.test.mjs
```

The SCM fixture is a frozen regression baseline, not production integration. For native desktop changes, the opt-in test controls an isolated fixture window:

```sh
ERP_CUA_DESKTOP_E2E=1 xvfb-run -a -s '-screen 0 1920x1080x24' npm test -- tests/computer-desktop.integration.mjs
```

Documentation-only changes run `npm run docs:check`. Live-model vision, user macOS and current real-ERP business acceptance are outside `npm run verify`.

## Local package

Pack the checkout with `npm pack`. Use a unique tarball path and verify the installed bytes; pnpm may cache a reused path. Install into an isolated DSH profile:

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.2.2-rc.5 --package=pnpm@11.28.5 -- dsh plugin --profile web add /absolute/path/guosheng_047-dsh-erp-0.1.6.tgz
```

`erp_runtime_status` and `erp_storage_status` report local process and storage health. `erp_model_probe` calls an existing model route and does not approve later business operations. After local validation, publish with the manual [Release Action](npm-publishing.en.md).

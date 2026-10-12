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

`verify` runs types, tests and artifact smoke. Smoke installs a tarball outside the repository and exercises real DSH, Chromium, IPC, approvals and local knowledge with a deterministic model. It does not call a live model or ERP. The build cleans `dist`; packages exclude fixtures and private user data.

For browser changes, run the affected headful tests:

```sh
npm run build
ERP_TEST_HEADFUL=1 xvfb-run -a node --test tests/browser.test.mjs tests/read-navigation.test.mjs tests/scm-learning.test.mjs
```

The SCM fixture is a frozen regression baseline, not production integration. For native desktop changes, the opt-in test controls an isolated fixture window:

```sh
ERP_CUA_DESKTOP_E2E=1 xvfb-run -a -s '-screen 0 1920x1080x24' node --test tests/computer-desktop.integration.mjs
```

Documentation changes need link, anchor and translation review; they do not require the full runtime suite. PRs record actual commands, source identity and untested cases. Live-model vision, user macOS and current real-ERP business acceptance remain pending. Historical [assessments](https://github.com/GuoMonth/dsh-erp/tree/main/docs/assessments) apply only to their dated versions; plan new business checks with the [test guide](https://github.com/GuoMonth/dsh-erp/blob/main/docs/testing/README.md).

## Local package

Use a unique tarball path and verify the installed bytes; pnpm may cache a reused path. Install into an isolated DSH profile:

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web add /absolute/path/guosheng_047-dsh-erp-0.1.1.tgz
```

`erp_runtime_status` and `erp_storage_status` report local process/storage health. `erp_model_probe` calls an existing model route; `erp_approval_probe` checks a no-op approval. Neither approves later business operations. Routine publication uses the manual [Release Action](npm-publishing.en.md), after local validation.

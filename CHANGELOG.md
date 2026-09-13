# Changelog

## 0.1.0-alpha.3 (prepared; npm publication pending)

- Use the npm package name `@guosheng_047/dsh-erp` with public access and the alpha dist-tag. The unscoped npm name belongs to a different project.
- Update the DSH bundle entry, installed-package smoke and migration instructions for the scoped package; retain the existing data directory.
- Add a manual Release Action: build and validate TGZ, publish to npm, verify registry bytes, and attach matching GitHub Release assets. Bootstrap once with an environment secret, then use npm Trusted Publishing. No push/PR CI is added.

## 0.1.0-alpha.2

- Rebuilt the precompiled TGZ from main after merging PR #28. Runtime code is unchanged from alpha.1.
- Removed GitHub Actions CI and documented local delivery checks.
- Updated installation examples; distributed through GitHub Releases, not npm.
- Real ERP acceptance remains the alpha.1 baseline; this release adds local package verification, not a new live ERP run.

## 0.1.0-alpha.1

SCM/USA read-only preview for dsh 0.1.5-rc.2 and Node 24.18+.

- Manual browser login and confirmed fixed read queries; credentials remain in the worker.
- Global menu metadata import, versioned hierarchy, explicit unnamed entries and retired topology.
- Durable breadth-first learning rounds with scoped evidence, pause/resume and blocked outcomes.
- Product → shared SPU stock → purchase/sale queries joined through SKU IDs, with bounded scans and original document states.
- AI knowledge, reverse relation queries, local Markdown/JSON exports, backup and integrity tools.
- Real DeepSeek model validation and retained failure evidence; see the version acceptance report.

ERP business writes, universal page/Tab/window exploration, dynamic capability repair and Windows/macOS desktop acceptance are deferred. This preview does not complete the original full M1–M5 scope.

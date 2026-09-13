# Changelog

## 0.1.0-alpha.7

- Publish every future release, including Alpha/Beta/RC previews, directly to npm `latest` through Trusted Publishing. Reject releases that would move `latest` backwards, and retain GitHub prerelease labels. The publication sets npm `latest`; historical `alpha` tags are no longer advanced. Runtime behavior is unchanged from alpha.6.

## 0.1.0-alpha.6

- Introduce Adapt ERP as the general browser-learning workflow; retain the existing scoped npm name. Remove production SCM/USA endpoints, token assumptions, product trace and menu import. Preserve the alpha.5 implementation only as a development test baseline.
- Add generic snapshots of visible menus, tables, fields, options and same-application frames; persist evidence and import UI structure into local knowledge. DSH interprets business domains and methods from that evidence.
- Add individually approved click/fill/select/scroll actions on short-lived, rechecked element refs, with fresh result snapshots and no automatic retries. All interactions require approval, including possible writes and autosaving queries.
- Extend persistent learning queues with newly discovered tasks. Retain system IDs and existing knowledge across upgrades; do not treat historical adapter knowledge as current UI verification.
- Ship only runtime code and user guides: exclude test fixtures, benchmark reports/answers and user knowledge. Clean dist before compilation to prevent deleted adapters being packaged.
- Validate distinct synthetic ERP UIs and approval boundaries locally. This is not a real-model universal ERP benchmark, QR/SSO acceptance or unattended full-site crawler.

## 0.1.0-alpha.5

- Add user-owned ERP entry/base URL and identity configuration in the DSH profile patch. Browser connection tools no longer accept model-selected URLs or scopes.
- Open the configured entry unchanged for manual login; remove the fixed login-route assumption and return to manual mode when SCM authentication is unavailable.
- Persist a permanent system ID with a separate local SQLite/evidence directory; expose configured scope for knowledge reuse across conversations without browser login, and reject other scopes.
- Align English and Simplified Chinese npm guides, configuration, storage, browser and roadmap documents. Explain fixed-adapter compatibility, historical versus live data, and deferred multi-system routing.
- Breaking upgrade: configured systems use new stores. Legacy data is retained and remains available without system configuration, but is not automatically imported. Browser login/permission must be re-established.
- Release candidate changes: publication is a separate manual step after merge; local checks do not imply new real ERP, QR/SSO or cross-platform acceptance.

## 0.1.0-alpha.4

- Lead the npm/GitHub README with English setup, first-session tasks, supported scope, data handling and lifecycle guidance; ship a matching Simplified Chinese guide under docs.
- Keep a single root README so npm selects the English text; add package homepage and issue links.
- Include the release propagation wait fix from main. Runtime behavior and the real ERP acceptance baseline are unchanged.
- Prepare this preview for the first real Trusted Publishing run after merge; this entry does not claim OIDC publication has passed.

## 0.1.0-alpha.3 — 2026-09-13

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

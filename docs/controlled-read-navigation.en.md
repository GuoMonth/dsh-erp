# Reviewed read routes

[简体中文](controlled-read-navigation.md) · [Managed browser](adaptive-learning.en.md)

Optional `browserMode: managed` entry. It stays off until configured. The standard path is native Browser Use / Playwright MCP. Agent tools cannot create or extend the contract.

## Enable

Set an absolute local path on the `erp` config. The target must be a regular file, not a symlink, and at most 128 KB. `siteUrl` and `scope` must match `erp_system_status`. At most 50 routes and 200 requests, with no wildcards.

```yaml
- id: erp
  config:
    browserReadPolicyFile: /absolute/local/path/reviewed-read-policy.json
```

1. `erp_browser_open` opens a blank window. Sign in inside the application yourself.
2. `erp_browser_read_policy` shows the contract and digest. `erp_browser_status` returns sessionId and revision.
3. `erp_browser_read_enable` submits those three values. After DSH confirms, the grant lasts 10 minutes and 20 attempts. A passive resume is not required first.
4. `erp_browser_read` accepts only a routeId from that grant. Success stores an observation.

## Limits

Each read uses a temporary context. Page changes are not written back to the manual profile, and the grant does not approve an ERP write. A contract that labels a writing request as read still changes the server. Failure, cancellation, expiry, human input or a contract change invalidates the grant. There is no automatic retry. One read allows at most 200 matched requests; navigation waits 10 seconds, and the whole read ends within 12 seconds.

See [read-policy.ts](../src/browser/read-policy.ts), [read-navigation.ts](../src/browser/read-navigation.ts) and [runtime.ts](../src/browser/runtime.ts). Tests: [read-navigation.test.mjs](../tests/read-navigation.test.mjs).

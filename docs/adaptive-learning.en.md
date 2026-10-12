# Managed browser

[简体中文](adaptive-learning.md) · [Guides](https://github.com/GuoMonth/dsh-erp/blob/main/docs/index.md)

Set `browserMode: managed` to use the plugin's separate browser. Standard installation uses [native tools](native-and-sharing.en.md). The two modes have different element references.

## Workflow

Call `erp_system_status`, then `erp_connect` to open the configured entry. Sign in manually. `erp_browser_status` returns the session and revision; `erp_browser_resume` asks you to confirm the identity and permits observation for up to 10 minutes.

`erp_browser_snapshot` saves visible menus, tables, fields, options and in-application frames. It returns evidence and short-lived element references. `erp_learning_import_snapshot` records visible structure; DSH adds business explanations and relationships. It preserves user corrections and existing interpretations.

Use `erp_browser_action` for one approved click, fill, select or scroll, followed by a result snapshot. Every interaction requires confirmation, including queries and input that might autosave. References expire after two minutes, are checked again before use and are consumed before execution. Failure does not trigger a retry. Inspect the page when the result is unclear.

Manual navigation or takeover pauses observation. `erp_browser_takeover` returns control to you; `erp_browser_close` closes the session and retains the private browser profile. Login state may expire. Restart does not restore observation permission.

## Learning queue

Use `erp_learning_start/status/extend/finish_unit/pause` to explore menus first, then pages, fields and business behavior. New shallow tasks run before deeper work. Each extension accepts at most 200 tasks, with 2000 total. Progress covers registered work, not every feature of the website. After restart, running tasks become paused and require explicit continuation.

## Limits

Snapshots capture visible DOM: at most 10 in-application frames, 30000 characters and 500 candidate controls per frame, and 300 usable references overall. Hidden content and cross-application frames are skipped. Custom dropdowns require opening and another observation. Canvas, closed Shadow DOM, complex SSO and multiple windows remain limited.

Password, hidden and file inputs, credential fields and `data-erp-private` areas are excluded. This is partial filtering; business data can still be saved and sent to the configured model. The application base limits selected pages and elements, not all website network traffic.

[Passive observation](https://github.com/GuoMonth/dsh-erp/blob/main/docs/browser-observation.md) and [contract-based navigation](https://github.com/GuoMonth/dsh-erp/blob/main/docs/controlled-read-navigation.md) are additional managed-mode interfaces for specific use cases. The latter requires a reviewed local policy. Storage and knowledge tools are shared with native mode.

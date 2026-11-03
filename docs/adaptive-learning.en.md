# Managed browser

[简体中文](adaptive-learning.md) · [Guides](index.md)

Set `browserMode: managed` to use the plugin's separate browser. Standard installation uses [native tools](native-and-sharing.en.md). The two modes have different element references.

## Workflow

Call `erp_system_status`, then `erp_connect` to open the configured entry. Sign in manually. `erp_browser_status` returns the session and revision; `erp_browser_resume` asks you to confirm the identity and permits observation for up to 10 minutes.

`erp_browser_snapshot` saves visible menus, tables, fields, options and in-application frames. It returns evidence and short-lived element references. `erp_learning_import_snapshot` records visible structure; DSH adds business explanations and relationships. It preserves user corrections and existing interpretations.

Use `erp_browser_action` for one approved click, fill, select or scroll, followed by a result snapshot. Every interaction requires confirmation, including queries and input that might autosave. References expire after two minutes, are checked again before use and are consumed before execution. Failure does not trigger a retry. Inspect the page when the result is unclear.

Manual navigation or takeover pauses observation. `erp_browser_takeover` returns control to you; `erp_browser_close` closes the session and retains the private browser profile. Login state may expire. Restart does not restore observation permission.

## Learning queue

`erp_learning_begin` creates a controller-owned queue and does not accept model-supplied units. Level 1 can be the entry snapshot alone. Level 2 opens pages and still needs approval for each open. Level 3 records visible fields, tabs and windows, then stops; there is no business-behavior level. When a level finishes, the controller writes one summary before the next level. `erp_learning_accept` submits the observation for the current step, `erp_learning_block` blocks only that step, and `erp_learning_status/pause` inspects or pauses the round. A round holds at most 2000 items, with at most 200 discoveries at a time. Progress covers this queue, not every feature of the website. After restart, a running round is paused and needs an explicit continuation.

## Limits

Snapshots capture visible DOM: at most 10 in-application frames, 30000 characters and 500 candidate controls per frame, and 300 usable references overall. Hidden content and cross-application frames are skipped. Custom dropdowns require opening and another observation. Canvas, closed Shadow DOM, complex SSO and multiple windows remain limited.

Password, hidden and file inputs, credential fields and `data-erp-private` areas are excluded. This is partial filtering; business data can still be saved and sent to the configured model. The application base limits selected pages and elements, not all website network traffic. Storage and knowledge tools are shared with native mode.

## Passive labels

`erp_browser_open` opens a blank window. You navigate and sign in inside the configured application. `erp_browser_observe` reads visible labels on the single current page and in-application frames, then saves evidence. It does not click, read input values or take screenshots. More than one page pauses observation until you leave one. The observation grant is not an ERP write approval. Reviewed routes are a separate, off-by-default [read contract](controlled-read-navigation.en.md).

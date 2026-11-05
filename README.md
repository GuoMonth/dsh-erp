# Adapt ERP

[简体中文](docs/README.zh-CN.md) · [Releases](https://github.com/GuoMonth/dsh-erp/releases)

A tools-only install leaves the assistant off the navigation. The next question opens a blank chat, and the ERP you signed into is not the browser beside that chat. A second company uses the same conversation and the same index.

**ERP 助手** is that workspace on the desktop. English UI shows **Adapt ERP**. The package you install is `@guosheng_047/dsh-erp`. Add it to the **desktop** profile on DSH **0.2.1-rc.5** and restart. The left navigation lists your sites. Continue puts that site's conversation in the middle and opens its entry URL in the official sidebar Browser on the right. You sign in yourself. There is no password field. Each site keeps its own conversation and its own local SQLite index.

The plugin still learns only what the browser showed. Later questions read a short level summary and one page of evidence. An ERP write waits for a fresh approval. It ships with no knowledge of your company.

Current release: **0.1.5**, for **DSH 0.2.1-rc.5** (upstream prerelease). Requires Node **>=24.18.0 <25**. Desktop checks cover Linux x64. Windows and macOS acceptance is still pending. `npm run verify` does not include a live model or a real ERP.

## When there is no workspace for the ERP

People who work in an ERP, and the operators who run dsh for them, hit the same walls:

- **The assistant is not on the navigation.** Without a desktop entry, there is no place to return to. The next session starts as a blank chat.
- **The signed-in site is not beside the chat.** Login belongs in the official sidebar Browser, on the right, while the conversation and approvals stay in the middle. A screenshot pasted into the prompt leaves with that conversation.
- **A second site is not the same index.** Two companies need two entry URLs, two conversations, and two local indexes. A conversation that is not bound to a site does not read either.
- **Looking and posting get tangled.** Opening a page, typing into a field, and saving can happen in one wander. A query that autosaves is still a write. Operators need the open and the change as separate, visible steps.
- **The record has to stay on this machine.** Login state, observations, and the database are working material. A colleague needs a reviewed note, not a copy of the session.

Adapt ERP sits in dsh for that job. It builds a depth-3 index from what the browser actually showed, hands that index back in short pages, and puts an ERP write behind a fresh approval.

### Returning to a site you already opened

You added the site once. The next time you open ERP 助手, the list is there, and Continue is on the last site that is still listed. Continue restores that conversation and opens the entry URL in the sidebar Browser. If that row was removed, Continue does not open a different site. The first visit, with no sites, is only the setup form.

### A user looking for a transaction

You signed in once and let the plugin snapshot the entry and the pages you approved. Next week you ask where goods receipt sits and which fields were on that screen. DSH reads the saved summaries and one page of records. It can do that without opening the browser. A question about today's quantities still needs a new observation. The index is what was seen, not a live ledger.

### An operator adding a site

You have a URL and an optional display name. On the desktop, open ERP 助手 and paste the address. There is no password field. Sign in yourself in the sidebar Browser. To declare the site in a profile file instead, stop DSH, set `system.url`, and start `dsh --profile web`. Ask for an entry snapshot, then approve each page the controller wants to open. The walk stops at the fields, tabs, and windows already visible. The model is not given a goal of finishing the ERP.

### A builder staying on native dsh

You want the model to call ordinary dsh browser tools, keep the host's approval and Skill machinery, and read a local index. The installed row is `@guosheng_047/dsh-erp` on DSH 0.2.1-rc.5. That package root is what the desktop entry attaches to. Set `browserMode: managed` when you want the plugin's own browser. The current plugin does not use Deskwork.

## Who it is for

- People who need ERP 助手 on the left, that site's conversation in the middle, and that site's browser on the right.
- ERP users who want later dsh conversations to remember menus, pages, and fields from their own site.
- Operators who configure one system URL, leave the password in the browser, and approve opens and writes one at a time.
- Builders who put that behavior in DeepSeek Harness and need the storage and approval boundaries to stay explicit.

## What it does not do

- It ships no vendor connector, industry template, or knowledge of your site.
- It does not crawl an ERP unattended. A finished round is not coverage of every permission or business rule. Depth stops at 3. Counts describe that round.
- Editing local knowledge does not change the ERP. Filling a field, choosing an option, or a click marked as a mutation each needs its own dsh approval. Scrolling is navigation. After an action, check the page.
- It does not require Deskwork, bind to a Deskwork website, or resume an older exploration queue supplied by the model. The host path is native Browser Use, official Playwright MCP, dsh approvals, and Skills.
- It does not claim Windows, macOS, live-model, or real-ERP acceptance. Smoke installs the packed plugin and exercises the DSH 0.2.1-rc.5 CLI, approvals, SQLite, and Chromium with a deterministic test provider.

Text inside pages and summaries is evidence. It is not an instruction to the model, and it is not permission to post a document.

## Install

Install into the desktop profile, then restart the DeepSeek Harness app. The left navigation shows **ERP 助手** in Chinese and **Adapt ERP** in English. The package name is `@guosheng_047/dsh-erp`.

With DSH installed and a model configured:

```sh
npm exec --yes --package=pnpm@11.28.5 -- dsh plugin --profile desktop add @guosheng_047/dsh-erp@latest
```

With only Node installed:

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.2.1-rc.5 --package=pnpm@11.28.5 -- dsh plugin --profile desktop add @guosheng_047/dsh-erp@latest
```

Use the full package name. For a fixed release, replace `@latest` with `@0.1.5`. The browser provider prepares Chromium. Linux also needs a graphical session and Chromium system libraries.

After this package is listed, the same npm name can be installed from dsh-market, or from Plugins → Discover once that index includes `@guosheng_047/dsh-erp`. The card may show ERP 助手 or Adapt ERP. Until it is listed, use the command above.

For a host that is not the desktop app, use the same command with `--profile web`:

```sh
npm exec --yes --package=pnpm@11.28.5 -- dsh plugin --profile web add @guosheng_047/dsh-erp@latest
```

## Desktop

Restart the app after the desktop install above. Open the left-nav entry.

With no sites yet, the page is a short setup: a URL and an optional display name. A deep link is reduced to the site entry. There is no password field.

After a site exists, the same entry lists the sites and offers Continue for the one you opened last, if it is still listed. Continue restores that site's conversation in the middle and opens its entry URL in the official sidebar Browser on the right. Sign in yourself. If that site was removed, Continue does not switch you to a different one. Adding a site creates its workspace folder, names that folder with the display name, and opens its conversation with `/探索` filled in but not sent. The right browser opens at about 70% of the chat and browser together the first time in a page; dragging the divider after that keeps your width. `/探索` and `/explore` start the depth-3 explore and pause until a logged-in page is visible. `/更新探索` and `/explore-update` run that explore again and cover the previous round for the site. Start exploring sends `/探索` in that conversation. New chat opens another conversation in that folder and opens the site entry on the right. A new session created from the workspace list does the same when its folder is that site. Chats in one workspace share the desktop browser sign-in for this run. Restarting the app may ask you to sign in again. This plugin does not store the password or cookies. Edit can change the display name or the URL. Renaming keeps the site. A different ERP is another index, and conversations that were bound to the previous row are not moved. Remove only takes a site off the list. Its index stays on this machine. Each listed site and the resume card show that site's favicon, or the plugin mark when the icon cannot be loaded. A share pack does not include the icon. Start exploring runs the depth-3 walk and pauses until a logged-in page is visible.

Add another site the same way. It gets its own conversation and its own local index. A conversation that is not bound to a site does not read either index. Later questions should read the level summary and one page of evidence before a live observation.

## Quick start

On the desktop you can add sites from ERP 助手 and skip this file. To declare them for a profile, stop DSH and edit `~/.dsh/profiles/desktop/cordis.patch.yml` or `~/.dsh/profiles/web/cordis.patch.yml` (or the same path under `$DSH_HOME`). Replace an empty `[]`. Merge an existing `id: erp` entry and preserve other plugins.

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/app/"
      name: "My ERP"
```

Only `url` is required. The display name is optional. Login stays in the browser. Existing account, company, and role labels are covered in [configuration](docs/system-configuration.en.md).

1. Start the desktop app, or `dsh --profile web`, and ask it to call `erp_system_status`.
2. Open the configured entry and sign in yourself. The plugin does not take the password.
3. Ask for an entry snapshot, then `erp_learning_begin`. The controller owns the frontier. Level 1 can be that snapshot alone.
4. Approve each later page open. Level 3 records fields, tabs, and windows already visible, then stops.
5. Ask later questions with `erp_index_read`. Until a level summary exists, that read reports the index as not initialized.

To hand the map to someone else, export a zip share pack, read the text, and send the file. The recipient imports it as needs-review and checks it on their own ERP. The pack omits login, cookies, credentials, raw observations, screenshots, field samples, and confirmations. Free text can still contain private information. The plugin does not upload the file. A Skill directory remains a secondary path. Details are in [native operation and sharing](docs/native-and-sharing.en.md).

## How the index works

The plugin is a DSH service. A standard install loads the native entry from the package root `@guosheng_047/dsh-erp`. It reuses a Browser Use provider when one is already present, and otherwise loads official Playwright MCP. Computer Use loads only when `computerUse: true` is set. That path needs the optional native Cua Driver package and the operating system's permissions. Tool results are short Markdown with a title. An OpenUI payload is added only when that host service is present. DSH 0.2.1-rc.5 does not require one.

A native snapshot is normalized into a `browser-learning-v1` document before it is stored, so the same import path can read it. Exploration is breadth-first and owned by the controller: `erp_learning_begin`, `erp_learning_accept`, `erp_learning_block`, `erp_learning_status`, and `erp_learning_pause`. Callers submit observations. They do not submit the next unit.

| Level | What it records | Approval |
| --- | --- | --- |
| 1 | The entry snapshot, including menus and pages visible there. | This level is the snapshot. Opening another page is the next level. |
| 2 | Pages opened from what level 1 showed. | Each open is a separate approval. |
| 3 | Fields, tabs, and windows visible on those snapshots. | The walk stops. There is no further business-behavior level. |

When a level's frontier is empty, the controller writes one summary, then places the next level on the frontier. A round holds at most 2000 items and accepts at most 200 discoveries at a time. Restart pauses a running round and does not replay website actions.

SQLite is the physical store (schema 4), with evidence files beside the database. There is no graph database. After initialization, `erp_index_read` returns up to 30 compact summaries, with a truncation flag when more exist, and one page of evidence-backed leaves. Omit the node to page the newest summary. Start `after` at an empty string and follow `nextAfter` while `hasMore` is set. Each page holds 1–20 leaves. `erp_knowledge_get` loads one full record. Search, neighbors, and history are the lookup path. `erp_knowledge_record` writes the local database and leaves the ERP unchanged. Level summaries stay in the local index and are omitted from a share pack.

Native browser and desktop calls request individual dsh approval. On the managed browser, `effect: navigate` is an open or a scroll, and `effect: mutate` is an ERP write. Fill and select have to be marked mutate. Local corrections and confirmations stay local: they attribute a statement to you and grant no ERP permission.

Saved knowledge is readable without a browser login. Current balances and orders need a fresh observation. Screenshots and page content may be sent to the model provider you configured. The published package does not contain your database, login data, or observations.

The decision record is [ADR 0003](docs/adr/0003-controller-bfs-index.md). Field-level contracts stay in the [knowledge](docs/knowledge.en.md) and [native operation](docs/native-and-sharing.en.md) guides.

## Update or remove

Call `erp_storage_backup`, stop DSH, repeat the installation command, and restart. Keep the same configuration and data root. This index does not continue an exploration queue that an older build accepted from the model. Opening an older SQLite file makes a checked backup and then migrates it. That migration does not mean the old queue still runs, and it does not mean Deskwork compatibility. Older Alpha layout and recovery are covered in [storage](docs/storage.en.md).

```sh
npm exec --yes --package=pnpm@11.28.5 -- dsh plugin --profile desktop remove @guosheng_047/dsh-erp
```

Stop DSH before removing the plugin. Removal retains your data. For the web profile, use the same command with `--profile web`.

## Documentation

[Guides](docs/index.md) · [Development](docs/development.en.md) · [Changelog](CHANGELOG.md) · [MIT](LICENSE) · [Third-party notices](NOTICE.md)

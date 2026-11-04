# Configure an ERP

[简体中文](system-configuration.md) · [Guides](index.md)

Configuration lives in the active DSH profile's `cordis.patch.yml`. See the [quick start](../README.md#quick-start) for the file location and installation. Restart DSH after editing.

## Website

On the desktop, a site is a bookmark: one URL and an optional display name. A deep link is reduced to the site entry. The stable application root is stored internally, so there is no separate `baseUrl` field. Sign in in the browser on the right. There is no password field.

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/web/login"
      name: "My ERP"
```

Only `url` is required. A paste must be `http` or `https`. Userinfo is removed and is neither shown nor stored. One-time query parameters and one-time hashes are removed too. Document, record, and callback URLs become the application home: the origin plus the stable root, ending in `/`. When the ERP's stable home is itself a hash route, that home is kept and only the one-time fragment is removed.

The display name defaults to the host name. Renaming does not select another site. A stable ID is stored for each normalized application root. Changing the domain or application path selects a different system. Returning to the original root finds the original ID.

An existing patch may still contain `baseUrl`, `account`, `tenant`, and `role`. Those values keep loading so the current index stays put. They are not on the desktop form. A different account label on the same root remains a separate index only for that existing configuration. `erp_system_status` returns the exact scope required by knowledge and learning tools.

## Several sites

On the desktop, add sites from ERP 助手. With no sites, that page is the setup. After one exists, Continue restores the last opened site's conversation and entry, and does not substitute a different site when that row is gone. Edit changes the display name or the URL. Adding a site creates its workspace folder, and another conversation can be opened under it. The patch can declare sites too. `system` is one site. `sites` adds others. Restart after editing the patch. A site removed in the desktop entry stays removed until you add it again.

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/app/"
    sites:
      - url: "https://other.example.com/app/"
        name: "Other ERP"
```

Each site keeps its own workspace folder, its own conversation, and its own SQLite scope. Switching sites does not mix them. There is still no password field.

## Browser options

The default [native mode](native-and-sharing.en.md) reuses the host browser provider or loads official Playwright MCP. `browserExecutablePath` selects an installed Chromium; `browserEndpoint` attaches to an existing browser. `computerUse: true` enables the official native Cua Driver.

For the separate [managed browser](adaptive-learning.en.md), set `browserMode: managed`. Its tools and element references differ from native mode. Reviewed read routes stay off unless configured; see the [read contract](controlled-read-navigation.en.md). Local storage, migration and backup are covered in [storage](storage.en.md).

# Configure an ERP

[简体中文](system-configuration.md) · [Guides](index.md)

Configuration lives in the active DSH profile's `cordis.patch.yml`. See the [quick start](../README.md#set-up-your-erp) for the file location and installation. Restart DSH after editing.

## Website and identity

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/app/login"
      baseUrl: "https://erp.example.com/app/"
      name: "My ERP"
      account: "work-account"
      tenant: "company-a"
      role: "purchasing"
```

Only `url` is required. If its path does not end in `/`, also set `baseUrl`. The base must end in `/` and contain the entry on the same origin. Paths and hash routes are preserved; credentials and query parameters, including queries inside the hash, are rejected. For SSO, use a durable entry and finish login in the browser.

The name defaults to the hostname; account defaults to `default`. Account, company and role labels separate local knowledge. Choose distinct labels for different identities and check them against your actual login. `erp_system_status` returns the exact scope required by knowledge and learning tools.

One plugin instance has one configured ERP. A stable ID is stored for each normalized base URL. Renaming the ERP keeps its ID; changing the domain or application path selects a different system. Returning to the original base finds the original ID.

## Deskwork

The plugin reads `DESKWORK_SITE_CONTEXT` for the website identity, name and URL. Its default data root is `DESKWORK_DATA_DIRECTORY/plugins/erp`. Explicit `system` and `dataDir` settings override these defaults. Outside Deskwork, use the profile configuration above.

## Browser options

The default [native mode](native-and-sharing.en.md) reuses the host browser provider or loads official Playwright MCP. `browserExecutablePath` selects an installed Chromium; `browserEndpoint` attaches to an existing browser. `computerUse: true` enables the official native Cua Driver.

For the separate [managed browser](adaptive-learning.en.md), set `browserMode: managed`. Its tools and element references differ from native mode. Local storage, migration and backup are covered in [storage](storage.en.md).

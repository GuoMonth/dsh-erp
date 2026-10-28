# Adapt ERP

[简体中文](docs/README.zh-CN.md) · [Releases](https://github.com/GuoMonth/dsh-erp/releases)

Learn your ERP through its browser interface and keep the knowledge on your machine. Adapt ERP is a DeepSeek Harness (DSH) plugin: you sign in, DSH observes the pages, and saved knowledge carries into later conversations. It starts with no knowledge of your site.

Current release: **0.1.2**, for **DSH 0.2.1-rc.3** (upstream prerelease). Requires Node **>=24.18.0 <25**. Desktop checks cover Linux x64; Windows/macOS acceptance is pending.

## Install

With DSH installed and a model configured:

```sh
npm exec --yes --package=pnpm@11.28.5 -- dsh plugin --profile web add @guosheng_047/dsh-erp@latest
```

With only Node installed:

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.2.1-rc.3 --package=pnpm@11.28.5 -- dsh plugin --profile web add @guosheng_047/dsh-erp@latest
```

Use the full package name. For a fixed release, replace `@latest` with `@0.1.2`. The browser provider prepares Chromium; Linux also needs a graphical session and Chromium system libraries.

## Set up your ERP

Stop DSH and edit `~/.dsh/profiles/web/cordis.patch.yml` (or `$DSH_HOME/profiles/web/cordis.patch.yml`). Replace an empty `[]`; merge an existing `id: erp` entry and preserve other plugins.

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/app/"
      account: "work-account"
```

Only `url` is required. `account` is a local identity label, not a password. Start `dsh --profile web`, ask it to check `erp_system_status`, then open the ERP and sign in yourself. Login paths, companies and roles are covered in [configuration](docs/system-configuration.en.md).

In Deskwork, bind the plugin to a website. It uses that website's context and task browser; explicit `system` and `dataDir` settings take precedence.

## Learn and reuse

Ask DSH to map the menus, then explore the pages and business relationships. It saves observations and knowledge locally. Native browser and desktop calls request individual approval; Deskwork uses its task confirmation policy. After an operation, check the result on the page.

Export useful experience as a Skill, review its text, and give the directory to another user. Imported knowledge requires review in the recipient's ERP. See [native operation and sharing](docs/native-and-sharing.en.md).

Saved knowledge can be read without logging in; current balances and orders need a fresh observation. Screenshots and page content may go to your configured model provider. Your database, login data and observations are excluded from the published package.

## Update or remove

Call `erp_storage_backup`, stop DSH, repeat the installation command and restart. Keep the same configuration and data root. Older Alpha migrations and recovery are covered in [storage](docs/storage.en.md).

```sh
npm exec --yes --package=pnpm@11.28.5 -- dsh plugin --profile web remove @guosheng_047/dsh-erp
```

Stop DSH before removing the plugin. Removal retains your data.

## Documentation

[Guides](docs/index.md) · [Development](docs/development.en.md) · [Changelog](CHANGELOG.md) · [MIT](LICENSE) · [Third-party notices](NOTICE.md)

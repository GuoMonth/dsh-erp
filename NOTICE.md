# Third-party components

The dsh-erp source is MIT licensed (see LICENSE). Dependency packages retain their own licenses and notices.

| Component | Pinned version | License |
| --- | --- | --- |
| Playwright / playwright-core | 1.63.0 | Apache-2.0 |
| @deepseek-ai/cordis | 4.0.2 | MIT |
| @deepseek-ai/dsh-tools | 0.1.5-rc.2 | MIT |
| @deepseek-ai/dsh-llm | 0.1.5-rc.2 | MIT |
| @deepseek-ai/schemastery | 3.18.2 | MIT |

The dsh packages are host peer dependencies. npm installs the dependency distributions with their upstream license files. Chromium is downloaded by Playwright on first browser setup and retains Chromium and third-party notices in that distribution; it is not relicensed as MIT by this plugin.

browser-use and browser-harness informed the research but are not bundled runtime dependencies. ERP application source, accounts, site data and model credentials are not included in the distribution. Model services and ERP services are configured by the user and are not supplied by this package.

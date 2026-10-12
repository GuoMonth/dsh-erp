# Publish to npm and GitHub

[简体中文](npm-publishing.md) · [Guides](index.md)

The package is `@guosheng_047/dsh-erp`. All releases publish to npm `latest`; Alpha/Beta/RC versions retain GitHub's prerelease label. The unscoped `dsh-erp` package belongs to another project.

## Release

1. Complete [local checks](development.en.md#checks). Update package version, lockfile, changelog and both user guides; merge the reviewed changes into `main`.
2. Run [Release npm package](https://github.com/GuoMonth/dsh-erp/actions/workflows/release.yml) on `main`, with the exact package version. Use `dry_run=true` to check build and packaging.
3. For publication, set `dry_run=false` and `auth=trusted`. The workflow publishes one TGZ with provenance, verifies registry bytes, then creates the tag and GitHub Release with TGZ and checksums.
4. Check the release and npm tag. Record the source commit and validation result.

The Action runs only by manual dispatch. It builds and checks the artifact; local tests establish behavior. Package contents exclude test fixtures, acceptance answers, databases, observations and login resources.

## Retry

The workflow rejects a lower `latest`, different bytes at an existing version, a conflicting source tag or asset. Retry on the same source commit and artifact after partial success; do not republish altered content at the same version. Registry propagation is polled for about 2.5 minutes without repeating publication.

## Trusted Publisher

The existing package uses GitHub OIDC. Its npm binding is:

| Setting | Value |
| --- | --- |
| Organization or user | GuoMonth |
| Repository | dsh-erp |
| Workflow | release.yml |
| Environment | npm-release |

The Action uses `contents: write` for the tag/Release and `id-token: write` for OIDC. No long-lived npm token is needed. `bootstrap-token` is retained only for creating a new package and is rejected for this existing one. See [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/).

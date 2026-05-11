# aha-coms

The COMS suite monorepo. Portal (identity, chrome, catalog) plus per-product apps, with shared libraries under `packages/`.

## Documentation

Architecture and contracts live in [`docs/`](./docs/). Start with:

- [`docs/integration-contract.md`](./docs/integration-contract.md) — the binding rulebook every app must follow.
- [`docs/spec/`](./docs/spec/) — one-shot consolidation and cleanup specs.
- [`docs/adr/`](./docs/adr/) — architectural decision records.

Execution plan and task list for in-flight work live in [`tasks/`](./tasks/).

## Dev setup (one-time after clone)

```sh
# Install gitleaks (macOS)
brew install gitleaks

# Activate the version-controlled git hooks
git config core.hooksPath .githooks

# Install workspace dependencies
bun install --frozen-lockfile
```

After this, every `git commit` runs the pre-commit hook in `.githooks/pre-commit`, which scans staged content for secrets via gitleaks. See [`.gitleaks.toml`](./.gitleaks.toml) for configuration and false-positive handling.

## Manual secret scans

```sh
# Audit the working tree (catches secrets in untracked files too)
gitleaks dir .

# Audit git history (run before releases)
gitleaks git
```

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
# Install pre-commit framework + gitleaks (macOS)
brew install pre-commit gitleaks

# Install the git hooks managed by .pre-commit-config.yaml
pre-commit install

# Install workspace dependencies
bun install --frozen-lockfile
```

After `pre-commit install`, every `git commit` runs the hooks configured in [`.pre-commit-config.yaml`](./.pre-commit-config.yaml) — currently gitleaks (secret scanning) and code-review-graph (change detection).

## Hook operations

```sh
# Run all hooks against the entire repo (not just staged content)
pre-commit run --all-files

# Run a single hook
pre-commit run gitleaks

# Update pinned hook versions
pre-commit autoupdate

# Skip a specific hook for one commit (use sparingly)
SKIP=gitleaks git commit -m "..."
```

## Manual secret scans

Configuration for gitleaks rules and allowlists lives in [`.gitleaks.toml`](./.gitleaks.toml).

```sh
# Audit the working tree (catches secrets in untracked files too)
gitleaks dir .

# Audit git history (run before releases)
gitleaks git
```

# ADR 0009: Bun for package management; runtime is per-app choice

Status: accepted (2026-05-11)

## Context

"Bun" refers to two distinct things:

1. **A package manager and workspace tool** — replaces npm/pnpm/Yarn for `install`, lockfile, and `workspace:*` resolution.
2. **A JavaScript runtime** — alternative to Node.js, with its own implementations of standard library APIs plus Bun-specific extensions (`Bun.serve`, `Bun.file`, etc.).

These are independent. A project can use Bun-as-package-manager while running on Node.js, or vice versa.

The COMS suite mixes frameworks with different runtime affinities:

- **Elysia** (portal-api, heroes-api) is Bun-native. It uses Bun-specific APIs and is most performant — and best supported — on Bun.
- **SvelteKit** (portal-web, heroes-web) is runtime-flexible. The existing apps use `svelte-adapter-bun`, deploying to Bun in production.
- **Next.js** (aha-fast) officially supports Node.js. Bun-as-Next-runtime is experimental and not production-grade as of writing.

The monorepo needs one consistent install + workspace tool. Each app needs the runtime its framework actually targets.

## Decision

**Bun is the suite-wide package management and workspace tool.** One `bun.lock` at the monorepo root. `bun install --frozen-lockfile` is the canonical install command everywhere — local dev, CI, every Dockerfile's install step.

**Runtime is a per-app choice**, determined by what the framework officially supports:

| App | Framework | Runtime |
|---|---|---|
| `portal-api` | Elysia | Bun |
| `portal-web` | SvelteKit | Bun (via `svelte-adapter-bun`) |
| `heroes-api` | Elysia | Bun |
| `heroes-web` | SvelteKit | Bun (via `svelte-adapter-bun`) |
| `fast` | Next.js | Node.js |

Each app's Dockerfile picks its own base image:

- Bun-runtime apps: `oven/bun:1` (or pinned version)
- Node.js-runtime apps: `node:22-alpine` (or similar)

Future apps choose the runtime their framework supports best. New Bun-friendly frameworks (Hono, Elysia) → Bun. Node-only frameworks (Next.js, Remix in some configurations) → Node.

## Consequences

**Positive.**

- One lockfile, one install command, one workspace resolution mechanism across the suite. No "this app uses npm, this one uses pnpm" cognitive tax.
- Bun's install speed benefits the entire tree, including the Node-runtime app (Bun installs faster than npm, even for Node-targeting projects).
- Each app runs on the runtime its framework is optimized for. Elysia stays performant on Bun; Next.js stays stable on Node.
- Container images stay framework-appropriate. No "force Bun runtime on Next.js" experiment running in production.
- Future migrations (Bun adds production-grade Next.js support, for example) are an in-place runtime swap, not a tooling change.

**Negative.**

- **aha-fast migrates from npm to Bun for installs.** Lockfile changes from `package-lock.json` to `bun.lock`. The migration is mechanical for most dependencies; native deps (`sharp`, `lightningcss`, Prisma binaries) occasionally surprise under Bun's install and may need workarounds.
- **Container image families are split** (`oven/bun:1` vs `node:*`). Slightly more Dockerfile maintenance — but each app's Dockerfile already exists and only needs its base image declared.
- **Engineers used to npm or pnpm pay a one-time learning cost** for Bun's CLI surface and lockfile format.
- **`bun install` quirks** with `postinstall` scripts and native binaries are real if rare. Plan for some debugging time during aha-fast's migration.

**Neutral.**

- Bun produces standard-layout `node_modules`, readable by both Bun and Node runtimes. The Next.js dev server and production runtime don't need to know Bun did the install.
- The `workspace:*` protocol is portable across package managers; switching tools later is mechanical if ever needed.

## Alternatives considered

**pnpm suite-wide.** Mature workspace tool, very widely used in the TypeScript ecosystem, excellent CLI ergonomics. Rejected because:

- Two of three current apps (portal, heroes) are already on Bun. Switching would mean retraining the engineers who built those apps and re-validating their dev/install/deploy flows for no functional benefit.
- Bun's install speed is materially better for our scale.
- The team has already proven Bun workspaces work for them, twice. Don't fix what isn't broken.

**Bun runtime for everything, including Next.js.** Tempting for tooling uniformity. Rejected because Bun's Next.js support is experimental as of 2026; running production traffic through it is not justified. Re-evaluate when Bun publishes a "production-ready Next.js" guarantee.

**Node + npm/pnpm for everything; rewrite Elysia apps to Hono on Node.** Would eliminate the Bun-runtime split. Real cost: rewriting two production Elysia services, retraining on Hono's API, losing Bun-native ergonomics. Not justified by tooling neatness alone.

## Practical guidance

- **Adding a new dependency**: `bun add <package>` (or `bun add -d` for dev deps). Commits the updated `bun.lock`.
- **Running a workspace-filtered script**: `bun run --filter <package-name> <script>`.
- **CI install**: `bun install --frozen-lockfile` — fails if the lockfile is stale, catching merge issues.
- **Dev install**: `bun install` — updates the lockfile if needed.
- **Native dep weirdness**: try `bun install --ignore-scripts=false`; check the package's repo for Bun-specific install notes; fall back to `npm install <package>` for that one package if absolutely necessary (the resulting `node_modules` works under Bun's install).
- **Dockerfiles** install via `bun install --frozen-lockfile --production` (production-only deps), regardless of runtime.

## References

- Integration contract §§ 7, 8 — where build commands and runtime choices surface in the rules.
- ADR 0001 (monorepo over polyrepo) — the structural decision Bun-as-package-manager implements.
- Heroes' and portal's existing `package.json` and Dockerfile patterns — the empirical evidence that this works.

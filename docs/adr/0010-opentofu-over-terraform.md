# ADR 0010: OpenTofu over Terraform

Status: accepted (2026-05-11)

## Context

Infrastructure-as-code for the COMS suite is currently authored in HashiCorp Configuration Language (HCL) and lives in per-app `infra/` directories (Cloud Run services, Cloud SQL, IAM, signing keys, scheduler, secrets). Both portal and heroes ship working stacks today.

Two CLI tools execute HCL configurations:

- **Terraform** (HashiCorp). Original. Changed its license from MPL 2.0 to Business Source License (BSL 1.1) on August 10, 2023. BSL restricts use cases that "compete" with HashiCorp's commercial products, with the actual scope of "competing" defined ambiguously enough to create legal review overhead for anyone shipping a product on top.
- **OpenTofu** (Linux Foundation). Forked from Terraform 1.5.7 in August 2023 in direct response to the license change. Donated to the Linux Foundation in early 2024. Licensed under MPL 2.0 (Terraform's pre-BSL license). Maintains file-level compatibility with Terraform: `.tf` configurations, `.terraform.lock.hcl` lock files, provider plugins, state file format, and the registry-based provider distribution all work the same.

The team's existing portal and heroes infrastructure was written with OpenTofu in mind and is invoked via the `tofu` CLI. The directory artifacts (`.terraform/`, `.terraform.lock.hcl`, `*.tf`) are file-compatible with Terraform, but the team uses OpenTofu in practice.

A future engineer reading the codebase will see `.tf` files and might reasonably ask "do I use `terraform` or `tofu` here?" This ADR answers that question.

## Decision

**OpenTofu (`tofu` CLI) is the suite-wide IaC tool.** All apps' `infra/` directories are authored against OpenTofu. CI pipelines invoke `tofu`, not `terraform`. The OpenTofu Registry is the canonical provider source.

Existing `.tf` configurations remain `.tf` — the file extension is shared between both tools and does not need renaming.

## Consequences

**Positive.**

- Open-source license (MPL 2.0) with no usage-scope restrictions. No legal review needed before adopting in any context.
- Avoids exposure to Terraform's BSL clauses and their associated ambiguity.
- Linux Foundation governance signals long-term stewardship by a vendor-neutral body.
- File compatibility with Terraform means existing AI tooling, online tutorials, AI-generated stub examples, and search results for `.tf` configurations remain useful — the language is identical.
- Migrating an `infra/` from Terraform to OpenTofu (or vice versa) is essentially a CLI substitution; no rewrite required if a future need pulls us back.

**Negative.**

- Smaller ecosystem (in absolute terms) than Terraform. Most providers are mirrored; some newer or niche providers may lag. As of 2026, every provider the team uses (`google`, `google-beta`, `random`) is present and current in the OpenTofu Registry.
- Cloud vendors' documentation often defaults to Terraform examples. Engineers must mentally translate `terraform plan` → `tofu plan` (mechanical).
- Some integrations (Cloud Build community modules, third-party tools) reference `terraform` binaries directly. Workaround: symlink `tofu` as `terraform` in the build environment when needed.

**Neutral.**

- The HCL language itself is identical. Configurations move freely between tools.
- State file format is compatible.
- Provider authentication, backends, modules — all unchanged.
- The `tofu` CLI is available on all major platforms (Linux, macOS, Windows, Cloud Build).

## Alternatives considered

**Stay on Terraform.** Largest community, most documentation, the original. Rejected because:

- The BSL license is the actual problem. Even if our usage is currently within HashiCorp's scope, the ambiguity creates ongoing legal review overhead and the precedent of a license change at any future point.
- The team has already adopted OpenTofu; switching back is a deliberate choice that would need its own justification.

**Pulumi (TypeScript IaC).** Real-language IaC, no HCL. Strong appeal for a TypeScript-heavy team. Rejected because:

- The team's existing infrastructure is in HCL. Migrating to Pulumi is a full rewrite.
- Cloud Run / Cloud SQL / GCP provider coverage in Pulumi is solid but the ecosystem is smaller than even OpenTofu's.
- Cognitive load: most engineers know HCL or learn it quickly; TypeScript-IaC introduces a different mental model.
- Re-evaluate in 2-3 years if Pulumi's GCP support or TypeScript-IaC fits the team's evolved style better.

**CDK for Terraform (CDKTF).** TypeScript that compiles to HCL. Bridges the appeal of real-language IaC with HCL execution. Rejected because:

- CDKTF is itself a HashiCorp project, currently under MPL 2.0 but inherits whatever license direction HashiCorp takes.
- Adds a compilation layer between source and HCL, complicating debugging.
- The existing infrastructure is already HCL — no benefit unless we're rewriting it.

**Crossplane or operator-based IaC.** Kubernetes-native infrastructure controllers. Rejected because:

- We don't run Kubernetes; we run Cloud Run.
- Wrong layer of abstraction for our scale.

## Practical guidance

- **CLI invocation**: `tofu init`, `tofu plan`, `tofu apply`. Substitute `tofu` for `terraform` in any documentation you find online.
- **Provider declarations**: identical to Terraform. `source = "hashicorp/google"` works; OpenTofu pulls from its own mirror that proxies HashiCorp's providers.
- **State backend**: GCS bucket configured per-app `infra/backend.tf`. Same configuration syntax as Terraform.
- **Cloud Build**: install `tofu` in the build step (`gcr.io/cloud-builders/curl` to fetch the binary, or a custom builder image with `tofu` pre-installed).
- **Migration FROM Terraform**: `tofu init -reconfigure` against the existing state. State file is binary-compatible. No `tfstate` manipulation needed.
- **Migration TO Terraform** (if ever): the inverse works. State and configs port back cleanly.

## What this ADR does NOT prescribe

- Specific provider versions. Each `infra/` pins what it needs in its `.terraform.lock.hcl`.
- Specific module structure (per-resource files vs grouped). Each `infra/` makes its own choice; established portal and heroes patterns are reasonable starting points.
- State backend specifics beyond "GCS, per-app, scoped IAM."

## References

- Integration contract §§ 8, 14.
- ADR 0001 (monorepo over polyrepo) — the structural decision; this ADR is about a tool within it.
- Portal's existing `infra/` (Cloud Run, Cloud SQL, WIF, signing keys, secrets) and heroes' existing `infra/` — the empirical evidence the choice works.
- HashiCorp license change announcement (August 2023). OpenTofu launch announcement (August 2023). OpenTofu donation to Linux Foundation (early 2024).

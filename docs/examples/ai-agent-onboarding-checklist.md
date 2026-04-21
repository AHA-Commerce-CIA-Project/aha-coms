# AI Agent Onboarding Checklist

Use this when onboarding an external service repo into the COMS portal platform.

## Inputs
- onboarding goal from a human
- repo source tree
- `portal.integration.json`
- portal contract package/version

## Default lane
1. Read and validate `portal.integration.json`.
2. Confirm the repo's runtime/framework matches the manifest.
3. Locate the service's auth/session boundary.
4. Add or update the portal auth adapter.
5. Ensure the app creates a local session after brokered exchange.
6. Confirm protected routes are enforced by the declared mode.
7. Add or update CI/compliance checks.
8. Report completion evidence.

## Stop and escalate when
- the manifest is missing or materially wrong
- the repo cannot support the declared adapter mode
- the repo needs an exception path
- user mapping to central identity is unclear
- deployment constraints break the brokered flow

## Output expected from the agent
- files changed
- manifest conformance result
- blocker list or completion evidence
- verification commands/tests run

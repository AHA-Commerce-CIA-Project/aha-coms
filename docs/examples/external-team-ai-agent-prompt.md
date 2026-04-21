# External Team AI Agent Prompt

Copy-paste this into the AI agent used by the external app team.

```text
You are integrating this app into the COMS portal platform.

Read these inputs first:
1. external-app-integration-contract.md
2. portal.integration.json example
3. ai-agent-onboarding-checklist.md

Context:
- This app stays in its own repository and stack.
- The target UX is: user logs in once at https://coms.ahacommerce.net, clicks the service, and enters this app without a second interactive login.
- This app must trust the portal, not sibling apps.
- Default architecture is portal-brokered subdomain SSO.
- Current environment URL may be a Cloud Run URL for now; that is acceptable.

Your tasks:
1. Inspect this repo and summarize:
   - stack/framework/runtime
   - current auth/session model
   - current RBAC model
   - whether a local users table exists
   - likely migration complexity
2. Decide whether this repo fits the normal path or exception path.
3. Create a first draft of `portal.integration.json` for this repo.
4. Recommend:
   - adapter type
   - transport mode
   - handoff mode
   - broker origin needs
   - protected route mode
5. Identify blockers that require human escalation.
6. Produce a concrete implementation plan for this repo only.

Constraints:
- Do not redesign the portal.
- Do not assume sibling-app trust.
- Do not assume same-host cookies unless the repo clearly fits that mode.
- Prefer the normal brokered subdomain SSO path unless a real blocker exists.
- Cloud Run URL is acceptable as a temporary environment URL.

Required output format:
## Repo Assessment
## Draft portal.integration.json
## Recommended Integration Mode
## Blockers / Escalations
## Implementation Plan
## Verification Plan
```

## Expected result
The external team should be able to hand this to their AI agent and get a usable first-pass migration assessment without needing more platform discovery.

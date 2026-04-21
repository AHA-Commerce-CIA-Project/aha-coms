# External Team Handoff Package

Use this document when asking another product team to integrate their app into the COMS portal platform.

## What to send them
Send these four docs/files:
1. `docs/external-app-integration-contract.md`
2. `docs/examples/portal.integration.json`
3. `docs/examples/ai-agent-onboarding-checklist.md`
4. `docs/examples/external-team-ai-agent-prompt.md`

If you are still collecting candidates before picking a pilot, also send:
5. `docs/examples/app-inventory-template.md`
6. `docs/examples/pilot-selection-rubric.md`

## What you need from the external team
Ask them to provide these inputs before or while they run their AI agent:
- repository URL
- owner / DRI
- current environment URL (Cloud Run URL is okay for now)
- target subdomain if known
- current auth method
- current RBAC model
- whether they have a local users table
- any known blockers or weird constraints

## What you should ask them to do
Tell them:
- keep their app in its own repo and stack
- follow the brokered subdomain SSO contract
- do not make sibling apps trust each other directly
- have their AI agent read the contract docs and generate a first-pass integration plan in their own repo
- escalate only on real blockers

## Minimal message you can send
```text
We now have the v1 COMS portal integration contract for external service apps.

Please review and use these docs in your repo with your AI agent:
- external-app-integration-contract.md
- portal.integration.json example
- ai-agent-onboarding-checklist.md
- external-team-ai-agent-prompt.md

Your app can stay in its own repo and stack. The target model is portal-brokered subdomain SSO: users log in once at coms.ahacommerce.net, then enter your app without a second interactive login. Apps should trust the portal, not sibling apps.

Please give your AI agent the prompt doc and let it produce:
1. a first-pass integration assessment
2. a draft portal.integration.json
3. blockers / exception-path needs if any
4. a proposed implementation plan for your repo
```

## Expected output from the external team
After running their AI agent, they should return:
- filled app inventory row or equivalent facts
- draft `portal.integration.json`
- recommended adapter / transport / handoff mode
- blocker list (if any)
- whether they fit the normal path or exception path
- rough implementation plan for their repo

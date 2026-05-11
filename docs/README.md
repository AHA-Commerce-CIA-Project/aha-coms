# Architecture docs

Cross-cutting architectural decisions for the COMS suite.

This top-level `docs/` is reserved for suite-level architecture — the integration contract every app must follow, one-shot consolidation specs, and architecture decision records (ADRs). It is the document set that defines how the apps fit together.

App-specific specs and design notes live alongside their app: `apps/<app>/docs/`. Package-specific notes live alongside their package: `packages/<lib>/docs/`. If an app team adopts spec-driven development for its internal work, those specs belong in the app's own docs folder, not here.

## Layout

- [`integration-contract.md`](./integration-contract.md) — long-lived rules every app must follow to live in the suite. Read this first.
- [`spec/`](./spec/) — one-shot consolidation and cleanup specs, numbered `NN-name.md`.
- [`adr/`](./adr/) — architecture decision records, numbered `NNNN-name.md`. Append-only history of load-bearing choices.

## When does a doc belong here vs. in an app or package?

| Belongs in `docs/` | Belongs in `apps/<app>/docs/` or `packages/<lib>/docs/` |
|---|---|
| Affects two or more apps or libs | Lives entirely inside one app or lib |
| Defines a cross-cutting contract | Defines internal patterns for one unit |
| Changes the integration contract | Changes one app's internal architecture |
| Captures a decision other apps will inherit | Captures a decision only this unit cares about |

If unsure, ask: "Would another app's engineer need to read this to do their job?" If yes, it belongs here.

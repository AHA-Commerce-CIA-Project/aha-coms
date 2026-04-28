# @coms-portal/design-tokens

COMS design tokens — colors, typography, spacing, radii, shadows, motion. Single source for the COMS suite (Heroes, etc.).

> **Status:** skeleton. Canonical token values live in `coms-ui/DESIGN.md` frontmatter today; this package will distribute them in machine-consumable formats once Phase 2 of Rev 3 Spec 02 ships.

## Distribution model

Matches `@coms-portal/shared`: standalone GitHub repo, semver-tagged, consumed via `git+https://github.com/mrdoorba/coms-design-tokens.git#vX.Y.Z`.

## Planned exports

```js
import '@coms-portal/design-tokens/css'        // CSS custom properties
import preset from '@coms-portal/design-tokens/tailwind'  // Tailwind preset
import { colors, spacing, radii } from '@coms-portal/design-tokens'  // TS exports
```

## Reference

See `DESIGN.md` in the [`coms-ui`](https://github.com/mrdoorba/coms-ui) repo for the canonical token reference.

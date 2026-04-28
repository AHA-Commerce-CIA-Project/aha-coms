# @coms-portal/design-tokens

COMS design tokens — colors, typography, spacing, radii, shadows. Single source for the COMS suite (portal, Heroes, future H-apps).

> **Status:** v1.0.0. Token values are sourced from `src/tokens.yaml`, regenerated to CSS / Tailwind preset / TS by `bun run build`. The yaml is canonical; `coms-ui/DESIGN.md` mirrors it.

## Install

Production (after the repo is pushed to GitHub with a v1.0.0 tag):

```sh
bun add git+https://github.com/mrdoorba/coms-design-tokens.git#v1.0.0
```

Local development (during initial portal dogfooding before the package is pushed):

```jsonc
// apps/web/package.json
"dependencies": {
  "@coms-portal/design-tokens": "file:../../../coms-design-tokens"
}
```

Swap the `file:` line for the `git+url` form once the package is pushed.

## Use

### Tailwind v4 (portal, Heroes — current consumers)

In your app's CSS entry point, import the generated stylesheet **after** `@import "tailwindcss"`:

```css
@import "tailwindcss";
@import "@coms-portal/design-tokens/css";
```

This loads the `@theme` block (brand + status colors, fonts, spacing scale, radii, shadows), the `@theme inline` semantic-color bindings, the `:root` light-mode surface tokens, and the `.dark` dark-mode overrides. Tailwind generates utility classes (`bg-primary`, `text-foreground`, `rounded-card`, etc.) directly from these.

### Tailwind v3 (hypothetical)

The package ships a v3-compatible preset stub. Portal does not consume it. If a v3 consumer ever materializes:

```js
import preset from '@coms-portal/design-tokens/tailwind'
export default { presets: [preset] }
```

### Typed access (charts, inline styles, runtime theming)

```ts
import { colors, spacing, rounded, typography, components } from '@coms-portal/design-tokens'

console.log(colors.brand.primary)   // "#325FEC"
console.log(colors.dark.background) // "#1C1E30"
console.log(spacing['lg'])          // "16px"
```

## Development

```sh
bun install
bun run build      # regenerates tokens.css, tokens.ts, tailwind-preset.js, index.ts from src/tokens.yaml
bun run typecheck
```

`src/tokens.yaml` is the source of truth. Edit yaml only; never hand-edit the generated outputs (they are overwritten on every build).

## Package exports

| Specifier | File | Use |
|---|---|---|
| `@coms-portal/design-tokens` | `src/index.ts` → re-exports `src/tokens.ts` | Typed token constants |
| `@coms-portal/design-tokens/css` | `src/tokens.css` | Tailwind v4 `@import` target |
| `@coms-portal/design-tokens/tailwind` | `src/tailwind-preset.js` | Tailwind v3 preset (stub) |
| `@coms-portal/design-tokens/yaml` | `src/tokens.yaml` | Raw yaml (for bespoke consumers) |

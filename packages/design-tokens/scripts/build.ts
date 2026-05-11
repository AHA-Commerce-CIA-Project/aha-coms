#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'src')

interface Tokens {
  version: number | string
  name: string
  colors: Record<string, string>
  typography: Record<string, Record<string, string | number>>
  rounded: Record<string, string>
  spacing: Record<string, string>
  components: Record<string, Record<string, string | number>>
}

const yamlPath = join(SRC, 'tokens.yaml')
const yaml = readFileSync(yamlPath, 'utf-8')
const tokens = parseYaml(yaml) as Tokens

// Partition colors into light, dark, and brand/status sets.
// Light-mode semantic names are the bare keys (background, foreground, …).
// Dark-mode names are the `dark-*` prefixed siblings (dark-background, …).
// Brand and status colors live in both modes unchanged.
// Semantic surface tokens: live in :root (light) and .dark (override). Bound to
// Tailwind utility names via @theme inline. `primary` is included here because
// the dark palette overrides it (`dark-primary`); without binding, `bg-primary`
// in dark mode would not pick up the override.
const LIGHT_SEMANTIC = new Set([
  'background',
  'foreground',
  'card',
  'card-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'ring',
])

interface ColorPartition {
  brand: Array<[string, string]>
  status: Array<[string, string]>
  lightSemantic: Array<[string, string]>
  darkSemantic: Array<[string, string]>
}

function partitionColors(colors: Record<string, string>): ColorPartition {
  const brand: Array<[string, string]> = []
  const status: Array<[string, string]> = []
  const lightSemantic: Array<[string, string]> = []
  const darkSemantic: Array<[string, string]> = []
  for (const [key, value] of Object.entries(colors)) {
    if (key.startsWith('dark-')) {
      darkSemantic.push([key.slice(5), value])
    } else if (key.startsWith('status-')) {
      status.push([key, value])
    } else if (LIGHT_SEMANTIC.has(key)) {
      lightSemantic.push([key, value])
    } else {
      brand.push([key, value])
    }
  }
  return { brand, status, lightSemantic, darkSemantic }
}

function pxToRem(px: string): string {
  // Tailwind's spacing unit baseline is 0.25rem = 4px. Convert px values to rem
  // for theme-scale alignment; pass through any non-px value verbatim.
  const m = /^(\d+(?:\.\d+)?)px$/.exec(px)
  if (!m) return px
  const n = Number(m[1])
  return `${n / 16}rem`
}

function emitTokensCss(t: Tokens): string {
  const { brand, status, lightSemantic, darkSemantic } = partitionColors(t.colors)
  const lines: string[] = []
  lines.push('/*')
  lines.push(' * @coms-portal/design-tokens — generated CSS token layer')
  lines.push(' *')
  lines.push(' * Source of truth: src/tokens.yaml. Do not hand-edit this file —')
  lines.push(' * `bun run build` regenerates it from yaml.')
  lines.push(' *')
  lines.push(' * Tailwind v4 consumers `@import` this file directly. The @theme block')
  lines.push(' * exposes brand + status colors, fonts, spacing, radii, and shadows as')
  lines.push(' * CSS custom properties Tailwind picks up via @theme.')
  lines.push(' * The :root and .dark blocks define light/dark semantic surfaces.')
  lines.push(' */')
  lines.push('')
  lines.push('@theme {')
  lines.push('  /* Brand palette (immutable across themes) */')
  for (const [k, v] of brand) lines.push(`  --color-${k}: ${v};`)
  lines.push('')
  lines.push('  /* Status colors */')
  for (const [k, v] of status) lines.push(`  --color-${k}: ${v};`)
  lines.push('')
  lines.push('  /* Fonts */')
  lines.push(`  --font-sans: 'Manrope', sans-serif;`)
  lines.push(`  --font-manrope: 'Manrope', sans-serif;`)
  lines.push('')
  lines.push('  /* Radii — kept in source units; px values like 99px / 9999px')
  lines.push('     express "fully rounded" intent and do not belong on the spacing scale */')
  for (const [k, v] of Object.entries(t.rounded)) {
    lines.push(`  --radius-${k}: ${v};`)
  }
  lines.push('')
  lines.push('  /* Spacing scale */')
  for (const [k, v] of Object.entries(t.spacing)) {
    lines.push(`  --spacing-${k}: ${pxToRem(v)};`)
  }
  lines.push('')
  lines.push('  /* Surface shadows (carried forward from prior portal app.css) */')
  lines.push('  --shadow-card: 0 2px 12px rgba(15, 14, 127, 0.10), 0 1px 3px rgba(0,0,0,0.06);')
  lines.push('  --shadow-card-hover: 0 8px 28px rgba(15, 14, 127, 0.16), 0 2px 8px rgba(0,0,0,0.08);')
  lines.push('  --shadow-modal: 0 8px 32px rgba(15, 14, 127, 0.18), 0 2px 8px rgba(0,0,0,0.10);')
  lines.push('  --shadow-glow-gold: 0 0 20px rgba(244, 193, 68, 0.35), 0 4px 12px rgba(244, 193, 68, 0.20);')
  lines.push('  --shadow-glow-blue: 0 0 20px rgba(50, 95, 236, 0.30), 0 4px 12px rgba(50, 95, 236, 0.18);')
  lines.push('}')
  lines.push('')
  lines.push('/*')
  lines.push(' * @theme inline binds Tailwind v4\'s --color-* utility names to the')
  lines.push(' * semantic CSS variables defined in :root and .dark below. Tailwind')
  lines.push(' * generates `bg-background`, `text-foreground`, etc. from this map.')
  lines.push(' */')
  lines.push('@theme inline {')
  for (const [k] of lightSemantic) lines.push(`  --color-${k}: var(--${k});`)
  lines.push('  --radius-sm: calc(var(--radius) * 0.6);')
  lines.push('  --radius-md: calc(var(--radius) * 0.8);')
  lines.push('  --radius-lg: var(--radius);')
  lines.push('  --radius-xl: calc(var(--radius) * 1.4);')
  lines.push('}')
  lines.push('')
  lines.push(':root {')
  for (const [k, v] of lightSemantic) lines.push(`  --${k}: ${v};`)
  lines.push('  --radius: 0.625rem;')
  lines.push('}')
  lines.push('')
  lines.push('.dark {')
  for (const [k, v] of darkSemantic) lines.push(`  --${k}: ${v};`)
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

function emitTokensTs(t: Tokens): string {
  const { brand, status, lightSemantic, darkSemantic } = partitionColors(t.colors)
  const obj = (entries: Array<[string, unknown]>): string => {
    if (entries.length === 0) return '{}'
    const body = entries
      .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
      .join('\n')
    return `{\n${body}\n}`
  }
  const nestedObj = (record: Record<string, Record<string, unknown>>): string => {
    const entries = Object.entries(record).map(([k, inner]) => {
      const innerEntries = Object.entries(inner).map(
        ([ik, iv]) => `    ${JSON.stringify(ik)}: ${JSON.stringify(iv)},`,
      )
      return `  ${JSON.stringify(k)}: {\n${innerEntries.join('\n')}\n  },`
    })
    return entries.length === 0 ? '{}' : `{\n${entries.join('\n')}\n}`
  }
  const lines: string[] = []
  lines.push('/*')
  lines.push(' * @coms-portal/design-tokens — typed token exports')
  lines.push(' *')
  lines.push(' * Source of truth: src/tokens.yaml. Do not hand-edit — `bun run build`')
  lines.push(' * regenerates this file. Use these constants when CSS custom properties')
  lines.push(' * are not reachable (inline styles, chart libraries, runtime theming).')
  lines.push(' */')
  lines.push('')
  lines.push(`export const colors = {`)
  lines.push(`  brand: ${obj(brand)} as const,`)
  lines.push(`  status: ${obj(status)} as const,`)
  lines.push(`  light: ${obj(lightSemantic)} as const,`)
  lines.push(`  dark: ${obj(darkSemantic)} as const,`)
  lines.push(`} as const`)
  lines.push('')
  lines.push(`export const rounded = ${obj(Object.entries(t.rounded))} as const`)
  lines.push('')
  lines.push(`export const spacing = ${obj(Object.entries(t.spacing))} as const`)
  lines.push('')
  lines.push(`export const typography = ${nestedObj(t.typography)} as const`)
  lines.push('')
  lines.push(`export const components = ${nestedObj(t.components)} as const`)
  lines.push('')
  lines.push(`export type ColorBrandKey = keyof typeof colors.brand`)
  lines.push(`export type ColorStatusKey = keyof typeof colors.status`)
  lines.push(`export type ColorSemanticKey = keyof typeof colors.light`)
  lines.push('')
  return lines.join('\n')
}

function emitTailwindPreset(t: Tokens): string {
  // Tailwind v3 preset stub. Portal (Tailwind v4) consumes tokens.css via @import
  // and never loads this file. Kept for hypothetical v3 consumers and v3-style
  // Storybook setups; documents the v3-only purpose in the header.
  const { brand, status } = partitionColors(t.colors)
  const lines: string[] = []
  lines.push('/*')
  lines.push(' * @coms-portal/design-tokens — Tailwind v3 preset (stub)')
  lines.push(' *')
  lines.push(' * v3 consumers only. The portal (Tailwind v4) imports `tokens.css`')
  lines.push(' * directly via `@import "@coms-portal/design-tokens/css"` and does not')
  lines.push(' * load this preset. Source of truth: src/tokens.yaml — do not hand-edit.')
  lines.push(' */')
  lines.push('')
  lines.push('export default {')
  lines.push('  theme: {')
  lines.push('    extend: {')
  lines.push('      colors: {')
  for (const [k, v] of brand) lines.push(`        ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
  for (const [k, v] of status) lines.push(`        ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
  lines.push('      },')
  lines.push('      borderRadius: {')
  for (const [k, v] of Object.entries(t.rounded)) {
    lines.push(`        ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
  }
  lines.push('      },')
  lines.push('      spacing: {')
  for (const [k, v] of Object.entries(t.spacing)) {
    lines.push(`        ${JSON.stringify(k)}: ${JSON.stringify(pxToRem(v))},`)
  }
  lines.push('      },')
  lines.push('      fontFamily: {')
  lines.push(`        sans: ['Manrope', 'sans-serif'],`)
  lines.push(`        manrope: ['Manrope', 'sans-serif'],`)
  lines.push('      },')
  lines.push('    },')
  lines.push('  },')
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

function emitIndexTs(): string {
  return `/*
 * @coms-portal/design-tokens — re-exports for typed token consumers.
 *
 * CSS consumers should import "./tokens.css" via the package's "./css"
 * export. Tailwind v3 consumers should consume the preset via the "./tailwind"
 * export. This module is the entry point for runtime token access.
 */

export * from './tokens'
`
}

const cssOut = emitTokensCss(tokens)
const tsOut = emitTokensTs(tokens)
const presetOut = emitTailwindPreset(tokens)
const indexOut = emitIndexTs()

writeFileSync(join(SRC, 'tokens.css'), cssOut)
writeFileSync(join(SRC, 'tokens.ts'), tsOut)
writeFileSync(join(SRC, 'tailwind-preset.js'), presetOut)
writeFileSync(join(SRC, 'index.ts'), indexOut)

console.log(`[design-tokens] Built tokens.css (${cssOut.length} bytes), tokens.ts (${tsOut.length} bytes), tailwind-preset.js (${presetOut.length} bytes), index.ts (${indexOut.length} bytes)`)

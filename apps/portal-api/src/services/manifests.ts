// Public face of the manifests service. Production code imports from
// `./manifests` or `~/services/manifests`; test files mock these specifiers
// when they want to stub the manifests service.
//
// `manifests.test.ts` imports the real implementation from
// `./manifests-internal` directly to bypass cross-file mock pollution
// (Bun's `mock.module` is process-global and not reset between test files).
//
// IMPORTANT: this file uses `import * as impl + export const X = impl.X`
// rather than `export * from './manifests-internal'`. The `export *` form
// keeps a live binding to the source module — when consumers `mock.module`
// this file after it has been loaded, Bun mutates the exports through the
// re-export chain, polluting `manifests-internal`'s exports too. The
// const-bound re-exports below capture function references at load time and
// stand alone, so a mock on this file does not reach into
// `manifests-internal`. See `manifests-internal.ts` for the rationale.

import * as impl from './manifests-internal'

export const validateConfig = impl.validateConfig
export const validateConfigSchemaShape = impl.validateConfigSchemaShape
export const seedDefaults = impl.seedDefaults
export const registerManifest = impl.registerManifest
export const loadAllManifests = impl.loadAllManifests

export type { ManifestDefinition, ValidationResult } from './manifests-internal'

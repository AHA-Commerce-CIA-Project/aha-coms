#!/usr/bin/env bun
// Shape-and-syntax verifier for firebase.json at the monorepo root.
//
// Asserts the JSON parses, names the staging site, and registers the
// rewrites in precedence order (most specific first). Used by T18 as the
// red-then-green check; can be re-run as a guard if the routing layer is
// ever edited by hand. The bare `/heroes` rewrite was added under T30 once
// the single-origin migration revealed that Firebase Hosting's `/heroes/**`
// glob does not match the slash-less path the portal launcher hands to the
// browser (`aha-coms.web.app/heroes?portal_code=…`). FU-10 added the
// analogous `/portal` + `/portal/**` rewrites and a `/` → `/portal` 301
// redirect so portal-web's manifest scope can narrow to /portal/ without
// orphaning visitors who land on the root.

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cfgPath = resolve(repoRoot, 'firebase.json')

const fail = (msg) => {
  console.error(`verify-firebase-json: ${msg}`)
  process.exit(1)
}

let cfg
try {
  cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
} catch (err) {
  if (err.code === 'ENOENT') fail(`firebase.json not found at ${cfgPath}`)
  fail(`firebase.json failed to parse: ${err.message}`)
}

const hosting = cfg.hosting
if (!hosting || typeof hosting !== 'object') fail('hosting block missing')
if (hosting.site !== 'aha-coms') {
  fail(`hosting.site must be "aha-coms" (got ${JSON.stringify(hosting.site)})`)
}

const expected = [
  { source: '/heroes/api/**', serviceId: 'coms-heroes-api' },
  { source: '/heroes', serviceId: 'coms-heroes-web' },
  { source: '/heroes/**', serviceId: 'coms-heroes-web' },
  { source: '/fast/api/**', serviceId: 'coms-fast-web' },
  { source: '/fast', serviceId: 'coms-fast-web' },
  { source: '/fast/**', serviceId: 'coms-fast-web' },
  { source: '/api/**', serviceId: 'coms-portal-api' },
  { source: '/portal', serviceId: 'coms-portal-web' },
  { source: '/portal/**', serviceId: 'coms-portal-web' },
  { source: '**', serviceId: 'coms-portal-web' },
]

const rewrites = hosting.rewrites
if (!Array.isArray(rewrites)) fail('hosting.rewrites must be an array')
if (rewrites.length !== expected.length) {
  fail(`expected ${expected.length} rewrites, got ${rewrites.length}`)
}

// FU-10: assert the / → /portal 301 redirect is present (single redirect rule).
const redirects = hosting.redirects
if (!Array.isArray(redirects)) fail('hosting.redirects must be an array (FU-10)')
if (redirects.length !== 1) fail(`expected 1 redirect, got ${redirects.length}`)
const r0 = redirects[0]
if (r0?.source !== '/') fail(`redirects[0].source must be "/" (got ${JSON.stringify(r0?.source)})`)
if (r0?.destination !== '/portal') {
  fail(`redirects[0].destination must be "/portal" (got ${JSON.stringify(r0?.destination)})`)
}
if (r0?.type !== 301) fail(`redirects[0].type must be 301 (got ${JSON.stringify(r0?.type)})`)

for (let i = 0; i < expected.length; i++) {
  const want = expected[i]
  const got = rewrites[i]
  if (got?.source !== want.source) {
    fail(`rewrite[${i}].source must be "${want.source}" (got ${JSON.stringify(got?.source)})`)
  }
  const runCfg = got?.run
  if (!runCfg || typeof runCfg !== 'object') {
    fail(`rewrite[${i}].run must be an object`)
  }
  if (runCfg.serviceId !== want.serviceId) {
    fail(`rewrite[${i}].run.serviceId must be "${want.serviceId}" (got ${JSON.stringify(runCfg.serviceId)})`)
  }
  if (runCfg.region !== 'asia-southeast2') {
    fail(`rewrite[${i}].run.region must be "asia-southeast2" (got ${JSON.stringify(runCfg.region)})`)
  }
}

console.log('verify-firebase-json: OK — site, rewrite ordering, and Cloud Run targets all match the contract.')

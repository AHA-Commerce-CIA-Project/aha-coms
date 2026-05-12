#!/usr/bin/env bun
// Shape-and-syntax verifier for firebase.json at the monorepo root.
//
// Asserts the JSON parses, names the staging site, and registers the four
// rewrites in precedence order (most specific first). Used by T18 as the
// red-then-green check; can be re-run as a guard if the routing layer is
// ever edited by hand.

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
  { source: '/heroes/**', serviceId: 'coms-heroes-web' },
  { source: '/api/**', serviceId: 'coms-portal-api' },
  { source: '**', serviceId: 'coms-portal-web' },
]

const rewrites = hosting.rewrites
if (!Array.isArray(rewrites)) fail('hosting.rewrites must be an array')
if (rewrites.length !== expected.length) {
  fail(`expected ${expected.length} rewrites, got ${rewrites.length}`)
}

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

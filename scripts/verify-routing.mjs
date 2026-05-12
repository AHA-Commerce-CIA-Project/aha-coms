#!/usr/bin/env bun
// Post-deploy probe for the Firebase Hosting routing layer.
//
// Walks the four paths firebase.json's rewrites cover and reports whether
// each landed at the expected Cloud Run service. Service identity is read
// off response bodies: portal-web emits `<title>COMS Portal</title>`,
// heroes-web emits `theme-color" content="#1D388B"`, portal-api returns
// JSON with a `status` field. The `/heroes/api/**` rewrite is dormant
// until T26 prefixes heroes-api's Elysia router; this probe documents the
// expectation but does not fail on a 404 there.
//
// Usage:
//   bun scripts/verify-routing.mjs https://aha-coms.web.app
//   ROUTING_URL=https://aha-coms.web.app bun scripts/verify-routing.mjs

const routingUrl = (process.argv[2] || process.env.ROUTING_URL || '').replace(/\/$/, '')
if (!routingUrl) {
  console.error('Usage: bun scripts/verify-routing.mjs <routing-url>')
  console.error('       e.g. https://aha-coms.web.app')
  process.exit(2)
}

const probes = [
  {
    path: '/',
    description: 'root → portal-web',
    expect: (status, body) => status === 200 && body.includes('<title>COMS Portal</title>'),
    marker: '<title>COMS Portal</title>',
    fatal: true,
  },
  {
    path: '/api/health',
    description: '/api/* → portal-api',
    expect: (status, body) => (status === 200 || status === 503) && body.includes('"status"'),
    marker: '"status":"ok"|"degraded"',
    fatal: true,
  },
  {
    path: '/heroes/',
    description: '/heroes/* → heroes-web',
    expect: (_status, body) => body.includes('theme-color" content="#1D388B"'),
    marker: 'theme-color #1D388B (heroes blue)',
    fatal: true,
  },
  {
    path: '/heroes/api/health',
    description: '/heroes/api/* → heroes-api (DORMANT until T26)',
    expect: () => true, // dormant — don't gate on this
    marker: 'any response from heroes-api Cloud Run (4xx expected pre-T26)',
    fatal: false,
  },
]

const results = []
let hardFails = 0

for (const probe of probes) {
  const url = routingUrl + probe.path
  try {
    const res = await fetch(url, { redirect: 'manual' })
    const body = await res.text()
    const passed = probe.expect(res.status, body)
    const verdict = passed ? 'PASS' : probe.fatal ? 'FAIL' : 'NOTE'
    if (!passed && probe.fatal) hardFails++
    results.push({
      path: probe.path,
      description: probe.description,
      verdict,
      status: res.status,
      length: body.length,
      excerpt: body.slice(0, 240).replace(/\s+/g, ' '),
      marker: probe.marker,
    })
  } catch (err) {
    hardFails += probe.fatal ? 1 : 0
    results.push({
      path: probe.path,
      description: probe.description,
      verdict: probe.fatal ? 'FAIL' : 'NOTE',
      status: 'NETWORK_ERROR',
      length: 0,
      excerpt: err.message,
      marker: probe.marker,
    })
  }
}

const pad = (s, n) => String(s).padEnd(n)
console.log(`\nverify-routing — ${routingUrl}\n`)
for (const r of results) {
  console.log(`  ${pad(r.verdict, 5)} ${pad(r.path, 22)} ${pad('HTTP ' + r.status, 12)} ${r.description}`)
  console.log(`        expect: ${r.marker}`)
  console.log(`        excerpt(${r.length}b): ${r.excerpt}`)
  console.log('')
}

if (hardFails > 0) {
  console.error(`verify-routing: ${hardFails} fatal probe(s) failed.`)
  process.exit(1)
}
console.log('verify-routing: routing layer reaches the contracted services.')

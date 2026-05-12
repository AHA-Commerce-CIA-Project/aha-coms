// Derivation helper for the ServiceBar `services` array.
//
// Apps used to hand-roll the launcher: walk `user.apps` (slug list), look
// each slug up in a static `APP_LAUNCHER` map, attach the current app's
// special-case "no href" rule, prepend the portal hub entry. Every app
// repeats the shape. Spec 02 Phase 4 / T40 lifts the derivation here so
// the suite has one source of truth for what a service tab is.
//
// Callers assemble the catalog (typically: a synthetic portal-hub entry
// followed by the rich `apps` array returned by `/api/userinfo`) and pass
// it through with the active app slug. When `currentOrigin` is provided
// and a catalog entry's `url` is rooted at it, the resulting `href`
// collapses to a path-relative form — the canonical shape in the
// single-origin (`aha-coms.web.app`) deployment.

export interface ServiceCatalogEntry {
  slug: string
  label: string
  url: string
}

export interface ServiceBarItem {
  slug: string
  label: string
  href?: string
}

export function deriveServiceBarServices(input: {
  catalog: readonly ServiceCatalogEntry[]
  currentApp: string
  currentOrigin?: string
}): ServiceBarItem[] {
  const { catalog, currentApp, currentOrigin } = input
  return catalog.map((entry) => {
    if (entry.slug === currentApp) {
      return { slug: entry.slug, label: entry.label }
    }
    let href = entry.url
    if (currentOrigin && href.startsWith(currentOrigin)) {
      href = href.slice(currentOrigin.length) || '/'
    }
    return { slug: entry.slug, label: entry.label, href }
  })
}

export interface ServiceCatalogEntry {
  slug: string;
  label: string;
  url: string;
}

export interface ServiceBarItem {
  slug: string;
  label: string;
  href?: string;
}

export function deriveServiceBarServices(input: {
  catalog: readonly ServiceCatalogEntry[];
  currentApp: string;
  currentOrigin?: string;
}): ServiceBarItem[] {
  const { catalog, currentApp, currentOrigin } = input;
  return catalog.map((entry) => {
    if (entry.slug === currentApp) {
      return { slug: entry.slug, label: entry.label };
    }
    let href = entry.url;
    if (currentOrigin && href.startsWith(currentOrigin)) {
      href = href.slice(currentOrigin.length) || '/';
    }
    return { slug: entry.slug, label: entry.label, href };
  });
}

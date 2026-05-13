import { base } from '$app/paths'
import {
  LayoutDashboard,
  Users,
  Building2,
  AppWindow,
  FileText,
  GitMerge,
  Tags,
  type LucideIcon,
} from '@lucide/svelte'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

// FU-10: portal-web mounts at /portal/ (svelte.config.js paths.base). Every
// internal href flows through `$app/paths` `base` so SvelteKit's router
// recognises the request — same shape heroes adopted in T25.

/** Always-visible items in desktop Sidebar / mobile MobileBottomNav. */
export const BASE_NAV: NavItem[] = [
  { href: `${base}/dashboard`, label: 'Dashboard', icon: LayoutDashboard },
]

/** Admin-only items, shown when `hasPortalRole(user.portalRole, ['admin'])`. */
// `/admin/app-config` is intentionally omitted: every registered manifest
// currently has an empty configSchema, so the page has no editable fields and
// confuses operators. The route + API stay intact and will be re-listed once
// a manifest ships a non-empty configSchema.
export const ADMIN_NAV: NavItem[] = [
  { href: `${base}/admin/employees`, label: 'Employees', icon: Users },
  { href: `${base}/admin/teams`, label: 'Teams', icon: Building2 },
  { href: `${base}/admin/apps`, label: 'Apps', icon: AppWindow },
  { href: `${base}/admin/aliases`, label: 'Alias Queue', icon: GitMerge },
  { href: `${base}/admin/taxonomies`, label: 'Taxonomies', icon: Tags },
  { href: `${base}/admin/audit`, label: 'Audit Log', icon: FileText },
]

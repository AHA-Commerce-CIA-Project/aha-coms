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

/** Always-visible items in desktop Sidebar / mobile MobileBottomNav. */
export const BASE_NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
]

/** Admin-only items, shown when `hasPortalRole(user.portalRole, ['admin'])`. */
// `/admin/app-config` is intentionally omitted: every registered manifest
// currently has an empty configSchema, so the page has no editable fields and
// confuses operators. The route + API stay intact and will be re-listed once
// a manifest ships a non-empty configSchema.
export const ADMIN_NAV: NavItem[] = [
  { href: '/admin/employees', label: 'Employees', icon: Users },
  { href: '/admin/teams', label: 'Teams', icon: Building2 },
  { href: '/admin/apps', label: 'Apps', icon: AppWindow },
  { href: '/admin/aliases', label: 'Alias Queue', icon: GitMerge },
  { href: '/admin/taxonomies', label: 'Taxonomies', icon: Tags },
  { href: '/admin/audit', label: 'Audit Log', icon: FileText },
]

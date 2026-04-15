import { Link, useRouter } from '@tanstack/react-router'
import type { SessionUser } from '~/server/functions/auth'
import { api } from '~/lib/eden'
import { signOut } from 'firebase/auth'
import { clientAuth } from '~/lib/gip-client'

interface Props {
  user: SessionUser
}

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/profile', label: 'Profile' },
]

const ADMIN_NAV = [
  { to: '/admin/employees', label: 'Employees' },
  { to: '/admin/teams', label: 'Teams' },
  { to: '/admin/audit', label: 'Audit Log' },
]

const SUPER_NAV = [
  { to: '/admin/apps', label: 'App Registry' },
  { to: '/admin/workspace-sync', label: 'Workspace Sync' },
]

export function Sidebar({ user }: Props) {
  const router = useRouter()
  const isAdmin = user.portalRole === 'admin' || user.portalRole === 'super_admin'
  const isSuperAdmin = user.portalRole === 'super_admin'

  async function handleSignOut() {
    await api.api.auth.logout.post({})
    await signOut(clientAuth)
    await router.navigate({ to: '/login', search: { redirect: '/' } })
  }

  return (
    <aside className="flex w-56 flex-col border-r border-neutral-800 bg-neutral-950 px-3 py-6">
      <div className="mb-6 px-2">
        <p className="text-xs font-semibold tracking-widest text-indigo-400 uppercase">COMS</p>
      </div>

      <nav className="flex-1 space-y-0.5">
        {NAV.map(({ to, label }) => (
          <NavItem key={to} to={to} label={label} />
        ))}

        {isAdmin && (
          <>
            <p className="mt-4 mb-1 px-2 text-xs text-neutral-600 uppercase tracking-wider">Admin</p>
            {ADMIN_NAV.map(({ to, label }) => (
              <NavItem key={to} to={to} label={label} />
            ))}
          </>
        )}

        {isSuperAdmin && SUPER_NAV.map(({ to, label }) => (
          <NavItem key={to} to={to} label={label} />
        ))}
      </nav>

      <div className="border-t border-neutral-800 pt-4">
        <div className="mb-3 px-2">
          <p className="text-xs font-medium truncate">{user.name}</p>
          <p className="text-xs text-neutral-500 truncate">{user.email}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="block rounded-lg px-2 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white [&.active]:bg-neutral-900 [&.active]:text-white [&.active]:font-medium"
      activeOptions={{ exact: to === '/' }}
    >
      {label}
    </Link>
  )
}

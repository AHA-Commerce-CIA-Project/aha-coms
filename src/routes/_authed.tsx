import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getSessionFn } from '~/server/functions/auth'
import { Sidebar } from '~/components/sidebar'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location }) => {
    const user = await getSessionFn()
    if (!user) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    return { user }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const { user } = Route.useRouteContext()
  return (
    <div className="flex h-full">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

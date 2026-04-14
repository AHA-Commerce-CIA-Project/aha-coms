import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api } from '~/lib/eden'
import { AppCard } from '~/components/app-card'

interface AppEntry {
  id: string
  slug: string
  name: string
  description: string | null
  url: string
  iconUrl: string | null
  status: string
}

export const Route = createFileRoute('/_authed/')({
  component: DashboardPage,
})

function DashboardPage() {
  const { user } = Route.useRouteContext()
  const [apps, setApps] = useState<AppEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.api.v1.dashboard.get().then(({ data }) => {
      if (data) setApps(data as AppEntry[])
      setLoading(false)
    })
  }, [])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold">Welcome back, {user.name.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-neutral-400">Your accessible applications</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-neutral-800" />
          ))}
        </div>
      ) : apps.length === 0 ? (
        <p className="text-sm text-neutral-500">No applications assigned yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  )
}

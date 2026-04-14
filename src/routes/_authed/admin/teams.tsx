import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api } from '~/lib/eden'

export const Route = createFileRoute('/_authed/admin/teams')({
  beforeLoad: ({ context }) => {
    const { portalRole } = context.user
    if (portalRole !== 'admin' && portalRole !== 'super_admin') {
      throw redirect({ to: '/' })
    }
  },
  component: TeamsPage,
})

interface Team {
  id: string
  name: string
  description: string | null
  createdAt: string
}

function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.api.v1.teams.get().then(({ data }) => {
      if (data) setTeams(data as Team[])
      setLoading(false)
    })
  }, [])

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Teams</h1>
        <Link
          to="/admin/teams/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
        >
          New team
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-neutral-800" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <p className="text-sm text-neutral-500">No teams yet.</p>
      ) : (
        <div className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
          {teams.map((team) => (
            <Link
              key={team.id}
              to="/admin/teams/$id"
              params={{ id: team.id }}
              className="flex items-center justify-between px-4 py-3 hover:bg-neutral-900"
            >
              <div>
                <p className="text-sm font-medium">{team.name}</p>
                {team.description && (
                  <p className="text-xs text-neutral-400">{team.description}</p>
                )}
              </div>
              <span className="text-xs text-neutral-500">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

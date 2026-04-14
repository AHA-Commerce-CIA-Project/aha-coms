import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api } from '~/lib/eden'

export const Route = createFileRoute('/_authed/admin/teams/$id')({
  beforeLoad: ({ context }) => {
    const { portalRole } = context.user
    if (portalRole !== 'admin' && portalRole !== 'super_admin') {
      throw redirect({ to: '/' })
    }
  },
  component: TeamDetailPage,
})

interface TeamDetail {
  id: string
  name: string
  description: string | null
  members: { id: string; name: string; email: string }[]
  apps: { id: string; name: string; slug: string }[]
}

function TeamDetailPage() {
  const { id } = Route.useParams()
  const [team, setTeam] = useState<TeamDetail | null>(null)
  const [loading, setLoading] = useState(true)

  function reload() {
    api.api.v1.teams({ id }).get().then(({ data }) => {
      if (data) setTeam(data as TeamDetail)
      setLoading(false)
    })
  }

  useEffect(reload, [id])

  async function removeMember(userId: string) {
    await api.api.v1.teams({ id }).members({ userId }).delete()
    reload()
  }

  if (loading) return <div className="p-8 text-neutral-400">Loading…</div>
  if (!team) return <div className="p-8 text-neutral-400">Team not found.</div>

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{team.name}</h1>
        {team.description && <p className="mt-1 text-sm text-neutral-400">{team.description}</p>}
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-300">Members ({team.members.length})</h2>
        {team.members.length === 0 ? (
          <p className="text-sm text-neutral-500">No members.</p>
        ) : (
          <div className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
            {team.members.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-neutral-400">{m.email}</p>
                </div>
                <button
                  onClick={() => removeMember(m.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-300">App Access ({team.apps.length})</h2>
        {team.apps.length === 0 ? (
          <p className="text-sm text-neutral-500">No apps granted.</p>
        ) : (
          <div className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
            {team.apps.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-neutral-400">{a.slug}</p>
                </div>
                <button
                  onClick={async () => {
                    await api.api.v1.access.teams({ id }).apps({ appId: a.id }).delete()
                    reload()
                  }}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

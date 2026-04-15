import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
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

interface TeamRow {
  id: string
  name: string
  description: string | null
  memberCount: number
  createdAt: string | Date
}

function TeamsPage() {
  const navigate = useNavigate()
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const limit = 20

  function reload() {
    setLoading(true)
    api.api.v1.teams.get({ query: { page: String(page), limit: String(limit), search: search || undefined } }).then(({ data }) => {
      if (data) {
        const rows = data as unknown as TeamRow[]
        setTeams(rows)
        setTotal(rows.length)
      }
      setLoading(false)
    })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, [page, search])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    setCreateError(null)
    const { data, error } = await api.api.v1.teams.post({
      name: newName.trim(),
      description: newDescription.trim() || undefined,
    })
    if (error) {
      setCreateError((error.value as { message?: string })?.message ?? 'Failed to create team')
      setCreating(false)
      return
    }
    const created = data as { id: string }
    setCreating(false)
    setShowCreate(false)
    setNewName('')
    setNewDescription('')
    navigate({ to: '/admin/teams/$id', params: { id: created.id } })
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Teams</h1>
        <button
          onClick={() => { setShowCreate((v) => !v); setCreateError(null) }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
        >
          New Team
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-6 max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-3"
        >
          <p className="text-sm font-medium">Create Team</p>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              placeholder="e.g. Engineering"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Description (optional)</label>
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Short description…"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          {createError && <p className="text-xs text-red-400">{createError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setCreateError(null) }}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mb-4">
        <input
          type="search"
          placeholder="Search by team name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 bg-neutral-900 text-xs text-neutral-400">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
              <th className="px-4 py-3 text-left font-medium">Members</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">Loading…</td>
              </tr>
            ) : teams.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                  {search ? 'No teams match your search.' : 'No teams yet.'}
                </td>
              </tr>
            ) : (
              teams.map((team) => (
                <tr
                  key={team.id}
                  onClick={() => navigate({ to: '/admin/teams/$id', params: { id: team.id } })}
                  className="cursor-pointer hover:bg-neutral-900"
                >
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to="/admin/teams/$id"
                      params={{ id: team.id }}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-indigo-400"
                    >
                      {team.name}
                    </Link>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-neutral-400">
                    {team.description ?? <span className="text-neutral-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{team.memberCount ?? 0}</td>
                  <td className="px-4 py-3 text-neutral-400">
                    {new Date(team.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-neutral-400">
        <span>{total} team{total !== 1 ? 's' : ''}</span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded px-3 py-1 hover:bg-neutral-800 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * limit >= total}
            className="rounded px-3 py-1 hover:bg-neutral-800 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

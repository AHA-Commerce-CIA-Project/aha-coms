import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '~/lib/eden'

export const Route = createFileRoute('/_authed/admin/teams/new')({
  beforeLoad: ({ context }) => {
    const { portalRole } = context.user
    if (portalRole !== 'admin' && portalRole !== 'super_admin') {
      throw redirect({ to: '/' })
    }
  },
  component: NewTeamPage,
})

function NewTeamPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error } = await api.api.v1.teams.post({ name, description: description || undefined })
      if (error) throw new Error((error.value as { message?: string })?.message ?? 'Failed')
      await navigate({ to: '/admin/teams' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create team')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold">New Team</h1>

      <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Team Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create team'}
          </button>
          <a href="/admin/teams" className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200">
            Cancel
          </a>
        </div>
      </form>
    </div>
  )
}

import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api } from '~/lib/eden'

export const Route = createFileRoute('/_authed/admin/apps')({
  beforeLoad: ({ context }) => {
    const { portalRole } = context.user
    if (portalRole !== 'super_admin') {
      throw redirect({ to: '/' })
    }
  },
  component: AppsPage,
})

interface AppRow {
  id: string
  name: string
  slug: string
  basePath: string
  url: string
  status: string
  createdAt: string | Date
}

function AppsPage() {
  const navigate = useNavigate()
  const [apps, setApps] = useState<AppRow[]>([])
  const [loading, setLoading] = useState(true)

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newBasePath, setNewBasePath] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    api.api.v1.apps.get().then(({ data }) => {
      if (data) {
        setApps(data as unknown as AppRow[])
      }
      setLoading(false)
    })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !newSlug.trim() || !newUrl.trim() || !newBasePath.trim()) return
    setCreating(true)
    setCreateError(null)
    const { data, error } = await api.api.v1.apps.post({
      name: newName.trim(),
      slug: newSlug.trim(),
      url: newUrl.trim(),
      basePath: newBasePath.trim(),
      description: newDescription.trim() || undefined,
    })
    if (error) {
      setCreateError((error.value as { message?: string })?.message ?? 'Failed to register app')
      setCreating(false)
      return
    }
    const created = data as { id: string }
    setCreating(false)
    setShowCreate(false)
    setNewName('')
    setNewSlug('')
    setNewUrl('')
    setNewBasePath('')
    setNewDescription('')
    navigate({ to: '/admin/apps/$id', params: { id: created.id } })
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">App Registry</h1>
        <button
          onClick={() => { setShowCreate((v) => !v); setCreateError(null) }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
        >
          Register App
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-6 max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-3"
        >
          <p className="text-sm font-medium">Register App</p>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              placeholder="e.g. HR Portal"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Slug</label>
            <input
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              required
              placeholder="e.g. hr-portal"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">URL</label>
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              required
              placeholder="https://hr.example.com"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Base Path</label>
            <input
              value={newBasePath}
              onChange={(e) => setNewBasePath(e.target.value)}
              required
              placeholder="e.g. /hr"
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
              {creating ? 'Registering…' : 'Register'}
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

      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 bg-neutral-900 text-xs text-neutral-400">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Slug</th>
              <th className="px-4 py-3 text-left font-medium">Base Path</th>
              <th className="px-4 py-3 text-left font-medium">URL</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">Loading…</td>
              </tr>
            ) : apps.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">No apps registered yet.</td>
              </tr>
            ) : (
              apps.map((app) => (
                <tr
                  key={app.id}
                  onClick={() => navigate({ to: '/admin/apps/$id', params: { id: app.id } })}
                  className="cursor-pointer hover:bg-neutral-900"
                >
                  <td className="px-4 py-3 font-medium">{app.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-400">{app.slug}</td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-400">{app.basePath}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-neutral-400">{app.url}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        app.status === 'active'
                          ? 'bg-green-950 text-green-400'
                          : app.status === 'maintenance'
                          ? 'bg-yellow-950 text-yellow-400'
                          : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      {app.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-400">
                    {new Date(app.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-neutral-400">
        {apps.length} app{apps.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

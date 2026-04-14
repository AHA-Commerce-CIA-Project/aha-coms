import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api } from '~/lib/eden'

export const Route = createFileRoute('/_authed/admin/apps')({
  beforeLoad: ({ context }) => {
    if (context.user.portalRole !== 'super_admin') throw redirect({ to: '/' })
  },
  component: AppsPage,
})

interface AppEntry {
  id: string
  slug: string
  name: string
  description: string | null
  url: string
  basePath: string | null
  iconUrl: string | null
  status: string
}

function AppsPage() {
  const [apps, setApps] = useState<AppEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ slug: '', name: '', description: '', url: '', basePath: '', iconUrl: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    api.api.v1.apps.get().then(({ data }) => {
      if (data) setApps(data as AppEntry[])
      setLoading(false)
    })
  }

  useEffect(reload, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await api.api.v1.apps.post({
      ...form,
      description: form.description || undefined,
      basePath: form.basePath || undefined,
      iconUrl: form.iconUrl || undefined,
    })
    if (error) {
      setError((error.value as { message?: string })?.message ?? 'Failed')
    } else {
      setShowForm(false)
      setForm({ slug: '', name: '', description: '', url: '', basePath: '', iconUrl: '' })
      reload()
    }
    setSaving(false)
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">App Registry</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
        >
          {showForm ? 'Cancel' : 'Register app'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-8 max-w-lg space-y-3 rounded-xl border border-neutral-800 p-4">
          {(['slug', 'name', 'url', 'basePath', 'iconUrl', 'description'] as const).map((f) => (
            <div key={f}>
              <label className="mb-1 block text-xs text-neutral-400 capitalize">{f}</label>
              <input
                value={form[f]}
                onChange={(e) => setForm((prev) => ({ ...prev, [f]: e.target.value }))}
                required={['slug', 'name', 'url'].includes(f)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          ))}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50">
            {saving ? 'Saving…' : 'Create'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-neutral-800" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
          {apps.map((app) => (
            <div key={app.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{app.name}</p>
                <p className="text-xs text-neutral-400">{app.slug} — {app.url}</p>
              </div>
              <span className={`text-xs rounded-full px-2 py-0.5 ${app.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-neutral-800 text-neutral-400'}`}>
                {app.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

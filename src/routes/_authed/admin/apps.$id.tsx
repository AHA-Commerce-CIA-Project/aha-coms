import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api } from '~/lib/eden'

export const Route = createFileRoute('/_authed/admin/apps/$id')({
  beforeLoad: ({ context }) => {
    const { portalRole } = context.user
    if (portalRole !== 'super_admin') {
      throw redirect({ to: '/' })
    }
  },
  component: AppDetailPage,
})

interface AppDetail {
  id: string
  name: string
  slug: string
  url: string
  basePath: string
  description: string | null
  status: string
  iconUrl: string | null
  cloudRunService: string | null
}

interface TeamAccessEntry {
  id: string
  teamId: string
  teamName: string
}

interface TeamOption {
  id: string
  name: string
}

function AppDetailPage() {
  const { id } = Route.useParams()
  const [app, setApp] = useState<AppDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // Info form state
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [url, setUrl] = useState('')
  const [basePath, setBasePath] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('active')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Team access state
  const [teamAccess, setTeamAccess] = useState<TeamAccessEntry[]>([])
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [granting, setGranting] = useState(false)
  const [grantError, setGrantError] = useState<string | null>(null)

  function reloadApp() {
    api.api.v1.apps.get().then(({ data }) => {
      if (data) {
        const all = data as unknown as AppDetail[]
        const found = all.find((a) => a.id === id) ?? null
        if (found) {
          setApp(found)
          setName(found.name)
          setSlug(found.slug)
          setUrl(found.url)
          setBasePath(found.basePath)
          setDescription(found.description ?? '')
          setStatus(found.status)
        }
      }
      setLoading(false)
    })
  }

  function reloadTeamAccess() {
    // Fetch all teams, then check each team's detail for access to this app
    api.api.v1.teams.get({ query: { limit: '200' } }).then(({ data }) => {
      if (!data) return
      const allTeams = data as unknown as { id: string; name: string }[]
      const promises = allTeams.map((t) =>
        api.api.v1.teams({ id: t.id }).get().then(({ data: detail }) => {
          if (!detail) return null
          const d = detail as unknown as {
            id: string
            name: string
            appAccess: { id: string; appId: string }[]
          }
          const entry = d.appAccess?.find((a) => a.appId === id)
          if (entry) {
            return { id: entry.id, teamId: t.id, teamName: t.name } satisfies TeamAccessEntry
          }
          return null
        }),
      )
      Promise.all(promises).then((results) => {
        setTeamAccess(results.filter((r): r is TeamAccessEntry => r !== null))
      })
    })
  }

  function loadTeamOptions() {
    api.api.v1.teams.get({ query: { limit: '200' } }).then(({ data }) => {
      if (data) {
        setTeamOptions(data as unknown as TeamOption[])
      }
    })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    reloadApp()
    reloadTeamAccess()
    loadTeamOptions()
  }, [id])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveMessage(null)
    const { error } = await api.api.v1.apps({ id }).patch({
      name: name.trim(),
      slug: slug.trim(),
      url: url.trim(),
      basePath: basePath.trim(),
      description: description.trim() || undefined,
      status: status as 'active' | 'maintenance' | 'deprecated',
    })
    if (error) {
      setSaveMessage({ type: 'error', text: (error.value as { message?: string })?.message ?? 'Failed to save' })
    } else {
      setSaveMessage({ type: 'success', text: 'Saved.' })
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm(`Deregister app "${app?.name}"? This cannot be undone.`)) return
    await api.api.v1.apps({ id }).delete()
    window.location.href = '/admin/apps'
  }

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTeamId) return
    setGranting(true)
    setGrantError(null)
    const { error } = await api.api.v1.teams({ id: selectedTeamId }).apps.post({ appId: id })
    if (error) {
      setGrantError((error.value as { message?: string })?.message ?? 'Failed to grant access')
      setGranting(false)
      return
    }
    setGranting(false)
    setSelectedTeamId('')
    reloadTeamAccess()
  }

  async function handleRevoke(teamId: string, teamName: string) {
    if (!confirm(`Revoke access for team "${teamName}"?`)) return
    await api.api.v1.teams({ id: teamId }).apps({ appId: id }).delete()
    reloadTeamAccess()
  }

  if (loading) return <div className="p-8 text-neutral-400">Loading…</div>
  if (!app) return <div className="p-8 text-neutral-400">App not found.</div>

  const grantedTeamIds = new Set(teamAccess.map((t) => t.teamId))
  const availableTeams = teamOptions.filter((t) => !grantedTeamIds.has(t.id))

  return (
    <div className="p-8 max-w-2xl space-y-8">

      {/* Section 1: App Info */}
      <section>
        <h1 className="mb-4 text-xl font-semibold">App</h1>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Slug</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Base Path</label>
            <input
              value={basePath}
              onChange={(e) => setBasePath(e.target.value)}
              required
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description…"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="deprecated">Deprecated</option>
            </select>
          </div>
          {saveMessage && (
            <p className={`text-xs ${saveMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {saveMessage.text}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 hover:bg-red-950"
            >
              Deregister app
            </button>
          </div>
        </form>
      </section>

      {/* Section 2: Team Access */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-300">
          Team Access ({teamAccess.length})
        </h2>

        {teamAccess.length === 0 ? (
          <p className="mb-4 text-sm text-neutral-500">No teams have access to this app.</p>
        ) : (
          <div className="mb-4 overflow-hidden rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-900 text-xs text-neutral-400">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Team</th>
                  <th className="px-4 py-2 text-left font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {teamAccess.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-2 font-medium">{entry.teamName}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleRevoke(entry.teamId, entry.teamName)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Grant Access Form */}
        <form
          onSubmit={handleGrant}
          className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-3"
        >
          <p className="text-xs font-medium text-neutral-300">Grant Access</p>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Select team</label>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="">— choose a team —</option>
              {availableTeams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {grantError && <p className="text-xs text-red-400">{grantError}</p>}
          <button
            type="submit"
            disabled={granting || !selectedTeamId}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            {granting ? 'Granting…' : 'Grant access'}
          </button>
        </form>
      </section>

    </div>
  )
}

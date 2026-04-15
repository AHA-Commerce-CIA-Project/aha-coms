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

interface TeamMember {
  id: string
  userId: string
  roleInTeam: string
  user: {
    id: string
    name: string
    email: string
  }
}

interface AppAccess {
  id: string
  appId: string
  name: string
  slug: string
}

interface TeamDetail {
  id: string
  name: string
  description: string | null
  members: TeamMember[]
  appAccess: AppAccess[]
}

interface EmployeeOption {
  id: string
  name: string
  email: string
}

function TeamDetailPage() {
  const { id } = Route.useParams()
  const [team, setTeam] = useState<TeamDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // Info form
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Add member form
  const [memberSearch, setMemberSearch] = useState('')
  const [memberOptions, setMemberOptions] = useState<EmployeeOption[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [roleInTeam, setRoleInTeam] = useState<'member' | 'lead'>('member')
  const [addingMember, setAddingMember] = useState(false)
  const [addMemberError, setAddMemberError] = useState<string | null>(null)

  function reload() {
    api.api.v1.teams({ id }).get().then(({ data }) => {
      if (data) {
        const t = data as TeamDetail
        setTeam(t)
        setName(t.name)
        setDescription(t.description ?? '')
      }
      setLoading(false)
    })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, [id])

  // Search employees for add-member dropdown
  useEffect(() => {
    if (!memberSearch.trim()) {
      setMemberOptions([])
      return
    }
    api.api.v1.employees.get({ query: { search: memberSearch, limit: '10' } }).then(({ data }) => {
      if (data) {
        const result = data as unknown as { employees: EmployeeOption[] }
        setMemberOptions(result.employees ?? [])
      }
    })
  }, [memberSearch])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveMessage(null)
    const { error } = await api.api.v1.teams({ id }).patch({
      name: name.trim(),
      description: description.trim() || undefined,
    })
    if (error) {
      setSaveMessage({ type: 'error', text: (error.value as { message?: string })?.message ?? 'Failed to save' })
    } else {
      setSaveMessage({ type: 'success', text: 'Saved.' })
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm(`Delete team "${team?.name}"? This cannot be undone.`)) return
    await api.api.v1.teams({ id }).delete()
    window.location.href = '/admin/teams'
  }

  async function handleRemoveMember(userId: string) {
    await api.api.v1.teams({ id }).members({ userId }).delete()
    reload()
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUserId) return
    setAddingMember(true)
    setAddMemberError(null)
    const { error } = await api.api.v1.teams({ id }).members.post({ userId: selectedUserId, roleInTeam })
    if (error) {
      setAddMemberError((error.value as { message?: string })?.message ?? 'Failed to add member')
      setAddingMember(false)
      return
    }
    setAddingMember(false)
    setSelectedUserId('')
    setMemberSearch('')
    setMemberOptions([])
    setRoleInTeam('member')
    reload()
  }

  if (loading) return <div className="p-8 text-neutral-400">Loading…</div>
  if (!team) return <div className="p-8 text-neutral-400">Team not found.</div>

  return (
    <div className="p-8 max-w-2xl space-y-8">

      {/* Section 1: Team Info */}
      <section>
        <h1 className="mb-4 text-xl font-semibold">Team</h1>
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
            <label className="mb-1 block text-xs text-neutral-400">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description…"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
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
              Delete team
            </button>
          </div>
        </form>
      </section>

      {/* Section 2: Members */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-300">
          Members ({team.members.length})
        </h2>

        {team.members.length === 0 ? (
          <p className="mb-4 text-sm text-neutral-500">No members yet.</p>
        ) : (
          <div className="mb-4 overflow-hidden rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-900 text-xs text-neutral-400">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Name</th>
                  <th className="px-4 py-2 text-left font-medium">Email</th>
                  <th className="px-4 py-2 text-left font-medium">Role</th>
                  <th className="px-4 py-2 text-left font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {team.members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 font-medium">{m.user.name}</td>
                    <td className="px-4 py-2 text-neutral-400">{m.user.email}</td>
                    <td className="px-4 py-2 text-neutral-400 capitalize">{m.roleInTeam}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleRemoveMember(m.userId)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Member Form */}
        <form
          onSubmit={handleAddMember}
          className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-3"
        >
          <p className="text-xs font-medium text-neutral-300">Add Member</p>
          <div className="relative">
            <label className="mb-1 block text-xs text-neutral-400">Search employee</label>
            <input
              value={memberSearch}
              onChange={(e) => { setMemberSearch(e.target.value); setSelectedUserId('') }}
              placeholder="Name or email…"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            {memberOptions.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950 text-sm shadow-lg">
                {memberOptions.map((emp) => (
                  <li key={emp.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUserId(emp.id)
                        setMemberSearch(`${emp.name} (${emp.email})`)
                        setMemberOptions([])
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-neutral-800"
                    >
                      <span className="font-medium">{emp.name}</span>
                      <span className="ml-2 text-neutral-400">{emp.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Role in team</label>
            <select
              value={roleInTeam}
              onChange={(e) => setRoleInTeam(e.target.value as 'member' | 'lead')}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="member">Member</option>
              <option value="lead">Lead</option>
            </select>
          </div>
          {addMemberError && <p className="text-xs text-red-400">{addMemberError}</p>}
          <button
            type="submit"
            disabled={addingMember || !selectedUserId}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            {addingMember ? 'Adding…' : 'Add member'}
          </button>
        </form>
      </section>

      {/* Section 3: App Access (read-only) */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-neutral-300">
          App Access ({team.appAccess.length})
        </h2>
        <p className="mb-3 text-xs text-neutral-500">Managed from the App Registry page.</p>
        {team.appAccess.length === 0 ? (
          <p className="text-sm text-neutral-500">No apps granted to this team.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-900 text-xs text-neutral-400">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">App</th>
                  <th className="px-4 py-2 text-left font-medium">Slug</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {team.appAccess.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 font-medium">{a.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-neutral-400">{a.slug}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  )
}

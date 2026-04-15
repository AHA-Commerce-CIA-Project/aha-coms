import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '~/lib/eden'

export const Route = createFileRoute('/_authed/admin/employees/new')({
  beforeLoad: ({ context }) => {
    const { portalRole } = context.user
    if (portalRole !== 'admin' && portalRole !== 'super_admin') {
      throw redirect({ to: '/' })
    }
  },
  component: CreateEmployeePage,
})

interface CreateForm {
  email: string
  name: string
  phone: string
  department: string
  position: string
  portalRole: 'employee' | 'admin'
  hasGoogleWorkspace: boolean
}

function CreateEmployeePage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<CreateForm>({
    email: '',
    name: '',
    phone: '',
    department: '',
    position: '',
    portalRole: 'employee',
    hasGoogleWorkspace: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error: apiError } = await api.api.v1.employees.post({
      email: form.email,
      name: form.name,
      phone: form.phone || undefined,
      department: form.department || undefined,
      position: form.position || undefined,
      portalRole: form.portalRole,
      hasGoogleWorkspace: form.hasGoogleWorkspace,
    })

    if (apiError) {
      setError((apiError.value as { message?: string })?.message ?? 'Failed to create employee.')
      setSubmitting(false)
      return
    }

    navigate({ to: '/admin/employees' })
  }

  function setField<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold">Create Employee</h1>

      <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
        <div>
          <label className="mb-1 block text-xs capitalize text-neutral-400">
            Email <span className="text-red-400">*</span>
          </label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs capitalize text-neutral-400">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs capitalize text-neutral-400">Phone</label>
          <input
            type="text"
            value={form.phone}
            onChange={(e) => setField('phone', e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs capitalize text-neutral-400">Department</label>
          <input
            type="text"
            value={form.department}
            onChange={(e) => setField('department', e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs capitalize text-neutral-400">Position</label>
          <input
            type="text"
            value={form.position}
            onChange={(e) => setField('position', e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Portal Role</label>
          <select
            value={form.portalRole}
            onChange={(e) => setField('portalRole', e.target.value as 'employee' | 'admin')}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="hasGoogleWorkspace"
            type="checkbox"
            checked={form.hasGoogleWorkspace}
            onChange={(e) => setField('hasGoogleWorkspace', e.target.checked)}
            className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 accent-indigo-500"
          />
          <label htmlFor="hasGoogleWorkspace" className="text-sm text-neutral-300">
            Already has a Google Workspace account
          </label>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create Employee'}
          </button>
          <Link
            to="/admin/employees"
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}

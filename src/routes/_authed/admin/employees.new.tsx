import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '~/lib/eden'

export const Route = createFileRoute('/_authed/admin/employees/new')({
  beforeLoad: ({ context }) => {
    const { portalRole } = context.user
    if (portalRole !== 'admin' && portalRole !== 'super_admin') {
      throw redirect({ to: '/' })
    }
  },
  component: NewEmployeePage,
})

function NewEmployeePage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    email: '',
    name: '',
    phone: '',
    department: '',
    position: '',
    portalRole: 'employee' as string,
    hasGoogleWorkspace: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function update(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error } = await api.api.v1.employees.post({
        ...form,
        phone: form.phone || undefined,
        department: form.department || undefined,
        position: form.position || undefined,
      })
      if (error) throw new Error((error.value as { message?: string })?.message ?? 'Failed')
      await navigate({ to: '/admin/employees' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create employee')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold">Add Employee</h1>

      <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
        <Field label="Email *" type="email" value={form.email} onChange={(v) => update('email', v)} required />
        <Field label="Full Name *" value={form.name} onChange={(v) => update('name', v)} required />
        <Field label="Phone" value={form.phone} onChange={(v) => update('phone', v)} />
        <Field label="Department" value={form.department} onChange={(v) => update('department', v)} />
        <Field label="Position" value={form.position} onChange={(v) => update('position', v)} />

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Portal Role</label>
          <select
            value={form.portalRole}
            onChange={(e) => update('portalRole', e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.hasGoogleWorkspace}
            onChange={(e) => update('hasGoogleWorkspace', e.target.checked)}
            className="rounded border-neutral-700"
          />
          Has Google Workspace account
        </label>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create employee'}
          </button>
          <a href="/admin/employees" className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200">
            Cancel
          </a>
        </div>
      </form>
    </div>
  )
}

function Field({
  label, value, onChange, type = 'text', required,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-neutral-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
    </div>
  )
}

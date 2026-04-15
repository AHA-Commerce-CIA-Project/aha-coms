import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api } from '~/lib/eden'

export const Route = createFileRoute('/_authed/admin/employees/$id')({
  beforeLoad: ({ context }) => {
    const { portalRole } = context.user
    if (portalRole !== 'admin' && portalRole !== 'super_admin') {
      throw redirect({ to: '/' })
    }
  },
  component: EmployeeDetailPage,
})

interface Employee {
  id: string
  email: string
  name: string
  phone: string | null
  department: string | null
  position: string | null
  portalRole: string
  hasGoogleWorkspace: boolean
  status: string
}

function EmployeeDetailPage() {
  const { id } = Route.useParams()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [form, setForm] = useState<Partial<Employee>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [resetStatus, setResetStatus] = useState<string | null>(null)

  useEffect(() => {
    api.api.v1.employees({ id }).get().then(({ data }) => {
      if (data) {
        setEmployee(data as Employee)
        setForm(data as Employee)
      }
      setLoading(false)
    })
  }, [id])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    const patch = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === null ? undefined : v]),
    )
    const { error } = await api.api.v1.employees({ id }).patch(patch)
    if (error) {
      setMessage({ type: 'error', text: (error.value as { message?: string })?.message ?? 'Failed' })
    } else {
      setMessage({ type: 'success', text: 'Saved.' })
    }
    setSaving(false)
  }

  async function handleDeactivate() {
    if (!confirm('Deactivate this employee? They will lose portal access.')) return
    const { error } = await api.api.v1.employees({ id }).delete()
    if (!error) window.location.href = '/admin/employees'
  }

  async function handleResetPassword() {
    setResetStatus(null)
    const { error } = await api.api.v1.employees({ id })['reset-password'].post({})
    if (error) {
      setResetStatus('Failed to send password reset email.')
    } else {
      setResetStatus(`Password reset email sent to ${employee?.email ?? 'the employee'}.`)
    }
  }

  if (loading) return <div className="p-8 text-neutral-400">Loading…</div>
  if (!employee) return <div className="p-8 text-neutral-400">Employee not found.</div>

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold">Edit Employee</h1>

      <form onSubmit={handleSave} className="max-w-lg space-y-4">
        <InfoRow label="Email" value={employee.email} />

        {(['name', 'phone', 'department', 'position'] as const).map((field) => (
          <div key={field}>
            <label className="mb-1 block text-xs capitalize text-neutral-400">{field}</label>
            <input
              value={(form[field] as string) ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
        ))}

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Portal Role</label>
          <select
            value={form.portalRole ?? 'employee'}
            onChange={(e) => setForm((f) => ({ ...f, portalRole: e.target.value }))}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>

        {message && (
          <p className={`text-xs ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message.text}
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
            onClick={handleResetPassword}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Reset Password
          </button>
          {employee.status === 'active' && (
            <button
              type="button"
              onClick={handleDeactivate}
              className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 hover:bg-red-950"
            >
              Deactivate
            </button>
          )}
        </div>
        {resetStatus && (
          <p className="mt-2 text-sm text-neutral-400">{resetStatus}</p>
        )}
      </form>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between rounded-lg border border-neutral-800 px-3 py-2 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span>{value}</span>
    </div>
  )
}

import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api } from '~/lib/eden'
import { EmployeeTable } from '~/components/employee-table'

export const Route = createFileRoute('/_authed/admin/employees')({
  beforeLoad: ({ context }) => {
    const { portalRole } = context.user
    if (portalRole !== 'admin' && portalRole !== 'super_admin') {
      throw redirect({ to: '/' })
    }
  },
  component: EmployeesPage,
})

interface Employee {
  id: string
  email: string
  name: string
  phone: string | null
  department: string | null
  position: string | null
  portalRole: string
  personalEmail: string | null
  hasGoogleWorkspace: boolean
  status: string
  gipUid: string | null
  createdAt: Date
  updatedAt: Date
}

function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const limit = 20

  useEffect(() => {
    setLoading(true)
    api.api.v1.employees.get({ query: { page: String(page), limit: String(limit), search: search || undefined } }).then(({ data }) => {
      if (data) {
        setEmployees((data as { data: Employee[]; total: number }).data)
        setTotal((data as { data: Employee[]; total: number }).total)
      }
      setLoading(false)
    })
  }, [page, search])

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Employees</h1>
        <Link
          to="/admin/employees/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
        >
          Add employee
        </Link>
      </div>

      <div className="mb-4">
        <input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <EmployeeTable employees={employees} loading={loading} />

      <div className="mt-4 flex items-center justify-between text-sm text-neutral-400">
        <span>{total} employee{total !== 1 ? 's' : ''}</span>
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

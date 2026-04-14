import { Link } from '@tanstack/react-router'

interface Employee {
  id: string
  email: string
  name: string
  department: string | null
  position: string | null
  portalRole: string
  status: string
}

interface Props {
  employees: Employee[]
  loading: boolean
}

export function EmployeeTable({ employees, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-neutral-800" />
        ))}
      </div>
    )
  }

  if (employees.length === 0) {
    return <p className="text-sm text-neutral-500">No employees found.</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 text-left text-xs text-neutral-500">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Department</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {employees.map((e) => (
            <tr key={e.id} className="hover:bg-neutral-900">
              <td className="px-4 py-3 font-medium">{e.name}</td>
              <td className="px-4 py-3 text-neutral-400">{e.email}</td>
              <td className="px-4 py-3 text-neutral-400">{e.department ?? '—'}</td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs">{e.portalRole}</span>
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs ${e.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-neutral-800 text-neutral-400'}`}>
                  {e.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  to="/admin/employees/$id"
                  params={{ id: e.id }}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

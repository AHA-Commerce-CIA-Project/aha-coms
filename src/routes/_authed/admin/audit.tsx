import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api } from '~/lib/eden'

export const Route = createFileRoute('/_authed/admin/audit')({
  beforeLoad: ({ context }) => {
    const { portalRole } = context.user
    if (portalRole !== 'admin' && portalRole !== 'super_admin') {
      throw redirect({ to: '/' })
    }
  },
  component: AuditPage,
})

interface AuditEntry {
  id: string
  action: string
  targetType: string
  targetId: string
  details: unknown
  createdAt: Date
  actor: { name: string; email: string } | null
}

function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const limit = 50

  useEffect(() => {
    setLoading(true)
    api.api.v1.access.audit.get({ query: { page: String(page), limit: String(limit) } }).then(({ data }) => {
      if (data) {
        const d = data as { entries: AuditEntry[]; total: number }
        setEntries(d.entries)
        setTotal(d.total)
      }
      setLoading(false)
    })
  }, [page])

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold">Audit Log</h1>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-neutral-800" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-neutral-500">No audit entries yet.</p>
      ) : (
        <div className="divide-y divide-neutral-800 rounded-xl border border-neutral-800 text-sm">
          {entries.map((e) => (
            <div key={e.id} className="grid grid-cols-[1fr_auto] gap-2 px-4 py-3">
              <div>
                <span className="font-mono text-xs text-indigo-400">{e.action}</span>
                <span className="mx-2 text-neutral-600">·</span>
                <span className="text-neutral-300">{e.targetType}</span>
                {e.actor && (
                  <span className="ml-2 text-xs text-neutral-500">by {e.actor.name}</span>
                )}
              </div>
              <time className="text-xs text-neutral-500 whitespace-nowrap">
                {new Date(e.createdAt).toLocaleString()}
              </time>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-neutral-400">
        <span>{total} entries</span>
        <div className="flex gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded px-3 py-1 hover:bg-neutral-800 disabled:opacity-40">Previous</button>
          <button onClick={() => setPage((p) => p + 1)} disabled={page * limit >= total} className="rounded px-3 py-1 hover:bg-neutral-800 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  )
}

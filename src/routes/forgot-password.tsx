import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { clientAuth } from '~/lib/gip-client'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await sendPasswordResetEmail(clientAuth, email)
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Reset Password</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Enter your email and we'll send a reset link.
          </p>
        </div>

        {sent ? (
          <div className="rounded-lg border border-green-800 bg-green-950 px-4 py-3 text-sm text-green-300">
            Check your inbox — a reset link has been sent to <strong>{email}</strong>.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-neutral-400">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-neutral-500">
          <a href="/login" className="underline hover:text-neutral-300">Back to sign in</a>
        </p>
      </div>
    </div>
  )
}

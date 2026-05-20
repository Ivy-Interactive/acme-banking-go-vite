import { useState } from 'react'
import { Building2, Lock } from 'lucide-react'
import { api, User } from '../api'

interface Props {
  onSuccess: (token: string, user: User) => void
}

export default function Login({ onSuccess }: Props) {
  const [username, setUsername] = useState('alice')
  const [password, setPassword] = useState('password')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.login(username, password)
      onSuccess(res.token, res.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-950 via-brand-800 to-brand-600 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-brand-500 p-2 text-white">
            <Building2 size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Acme Banking</h1>
            <p className="text-sm text-slate-500">Sign in to your account</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
          >
            <Lock size={16} />
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p className="mb-1 font-semibold text-slate-700">Demo accounts</p>
          <ul className="space-y-0.5 font-mono">
            <li>alice / password</li>
            <li>bob / password</li>
            <li>demo / demo</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

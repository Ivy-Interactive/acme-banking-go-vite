import { useEffect, useState } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import { api, getToken, setToken, User } from './api'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    api.me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  function handleLogin(token: string, u: User) {
    setToken(token)
    setUser(u)
  }

  async function handleLogout() {
    try {
      await api.logout()
    } catch {
      /* ignore */
    }
    setToken(null)
    setUser(null)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Loading…
      </div>
    )
  }

  if (!user) return <Login onSuccess={handleLogin} />
  return <Dashboard user={user} onLogout={handleLogout} />
}

const TOKEN_KEY = 'acme.token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(path, { ...init, headers })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null

  if (!res.ok) {
    const msg = (body && body.error) || `Request failed (${res.status})`
    throw new Error(msg)
  }
  return body as T
}

export interface User {
  username: string
  full_name: string
  account_number: string
}

export interface Account extends User {
  balance_cents: number
  balance_formatted: string
}

export interface Transaction {
  id: number
  kind: 'deposit' | 'withdraw' | 'transfer_in' | 'transfer_out'
  amount_cents: number
  amount_formatted: string
  balance_after_cents: number
  balance_after_formatted: string
  description: string
  counterparty?: string
  created_at: string
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ status: string }>('/api/logout', { method: 'POST' }),
  me: () => request<User>('/api/me'),
  account: () => request<Account>('/api/account'),
  transactions: () => request<Transaction[]>('/api/transactions'),
  deposit: (amount_cents: number, description?: string) =>
    request<Account>('/api/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount_cents, description: description ?? '' }),
    }),
  withdraw: (amount_cents: number, description?: string) =>
    request<Account>('/api/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount_cents, description: description ?? '' }),
    }),
  transfer: (to_account: string, amount_cents: number, description?: string) =>
    request<{ balance_cents: number; balance_formatted: string; recipient: string }>('/api/transfer', {
      method: 'POST',
      body: JSON.stringify({ to_account, amount_cents, description: description ?? '' }),
    }),
}

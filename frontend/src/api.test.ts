import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { api, getToken, setToken } from './api'
import { server } from './test/server'

describe('token storage', () => {
  it('setToken writes and getToken reads localStorage', () => {
    expect(getToken()).toBeNull()
    setToken('abc')
    expect(getToken()).toBe('abc')
    expect(localStorage.getItem('acme.token')).toBe('abc')
  })

  it('setToken(null) removes the token', () => {
    setToken('abc')
    setToken(null)
    expect(getToken()).toBeNull()
    expect(localStorage.getItem('acme.token')).toBeNull()
  })
})

describe('request headers', () => {
  it('always sends Content-Type: application/json', async () => {
    let seen: string | null = null
    server.use(
      http.get('/api/me', ({ request }) => {
        seen = request.headers.get('Content-Type')
        return HttpResponse.json({
          username: 'alice',
          full_name: 'Alice Anderson',
          account_number: 'ACME-1001-2034',
        })
      }),
    )
    await api.me()
    expect(seen).toBe('application/json')
  })

  it('adds Authorization: Bearer <token> when a token is set', async () => {
    setToken('xyz')
    let seen: string | null = null
    server.use(
      http.get('/api/me', ({ request }) => {
        seen = request.headers.get('Authorization')
        return HttpResponse.json({
          username: 'alice',
          full_name: 'Alice Anderson',
          account_number: 'ACME-1001-2034',
        })
      }),
    )
    await api.me()
    expect(seen).toBe('Bearer xyz')
  })

  it('omits Authorization when no token is set', async () => {
    let seen: string | null = 'sentinel'
    server.use(
      http.post('/api/login', ({ request }) => {
        seen = request.headers.get('Authorization')
        return HttpResponse.json({
          token: 't',
          expires_at: '2026-06-01T00:00:00Z',
          user: { username: 'alice', full_name: 'Alice', account_number: 'A' },
        })
      }),
    )
    await api.login('alice', 'password')
    expect(seen).toBeNull()
  })
})

describe('error handling', () => {
  it('throws Error with body.error message on non-2xx', async () => {
    server.use(
      http.post('/api/deposit', () =>
        HttpResponse.json({ error: 'amount must be positive' }, { status: 400 }),
      ),
    )
    await expect(api.deposit(-1)).rejects.toThrow('amount must be positive')
  })

  it('throws fallback message when body has no error field', async () => {
    server.use(http.post('/api/deposit', () => new HttpResponse('', { status: 500 })))
    await expect(api.deposit(100)).rejects.toThrow('Request failed (500)')
  })
})

describe('api methods', () => {
  it('login POSTs username + password to /api/login', async () => {
    let body: unknown = null
    server.use(
      http.post('/api/login', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({
          token: 't',
          expires_at: '2026-06-01T00:00:00Z',
          user: { username: 'alice', full_name: 'Alice', account_number: 'A' },
        })
      }),
    )
    const res = await api.login('alice', 'password')
    expect(body).toEqual({ username: 'alice', password: 'password' })
    expect(res.token).toBe('t')
  })

  it('logout POSTs to /api/logout', async () => {
    let method = ''
    server.use(
      http.post('/api/logout', ({ request }) => {
        method = request.method
        return HttpResponse.json({ status: 'ok' })
      }),
    )
    await api.logout()
    expect(method).toBe('POST')
  })

  it('transfer sends to_account, amount_cents, description', async () => {
    let body: unknown = null
    server.use(
      http.post('/api/transfer', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({
          balance_cents: 100,
          balance_formatted: '1.00',
          recipient: 'Bob',
        })
      }),
    )
    await api.transfer('ACME-1001-4521', 10000, 'Rent')
    expect(body).toEqual({
      to_account: 'ACME-1001-4521',
      amount_cents: 10000,
      description: 'Rent',
    })
  })

  it('transfer defaults description to empty string when omitted', async () => {
    let body: { description?: string } = {}
    server.use(
      http.post('/api/transfer', async ({ request }) => {
        body = (await request.json()) as { description?: string }
        return HttpResponse.json({
          balance_cents: 0,
          balance_formatted: '0.00',
          recipient: 'Bob',
        })
      }),
    )
    await api.transfer('ACME-1001-4521', 100)
    expect(body.description).toBe('')
  })

  it('account, me, transactions issue GETs', async () => {
    const seen: string[] = []
    server.use(
      http.get('/api/me', ({ request }) => {
        seen.push(`${request.method} ${new URL(request.url).pathname}`)
        return HttpResponse.json({ username: 'a', full_name: 'A', account_number: 'A' })
      }),
      http.get('/api/account', ({ request }) => {
        seen.push(`${request.method} ${new URL(request.url).pathname}`)
        return HttpResponse.json({
          username: 'a',
          full_name: 'A',
          account_number: 'A',
          balance_cents: 0,
          balance_formatted: '0.00',
        })
      }),
      http.get('/api/transactions', ({ request }) => {
        seen.push(`${request.method} ${new URL(request.url).pathname}`)
        return HttpResponse.json([])
      }),
    )
    await api.me()
    await api.account()
    await api.transactions()
    expect(seen).toEqual(['GET /api/me', 'GET /api/account', 'GET /api/transactions'])
  })
})

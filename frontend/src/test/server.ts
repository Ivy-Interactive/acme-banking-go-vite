import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { Account, Transaction, User } from '../api'

export const aliceUser: User = {
  username: 'alice',
  full_name: 'Alice Anderson',
  account_number: 'ACME-1001-2034',
}

export const aliceAccount: Account = {
  ...aliceUser,
  balance_cents: 125000,
  balance_formatted: '1250.00',
}

export const openingDepositTx: Transaction = {
  id: 1,
  kind: 'deposit',
  amount_cents: 125000,
  amount_formatted: '1250.00',
  balance_after_cents: 125000,
  balance_after_formatted: '1250.00',
  description: 'Opening deposit',
  created_at: '2026-04-25T12:00:00Z',
}

export const handlers = [
  http.post('/api/login', async ({ request }) => {
    const body = (await request.json()) as { username: string; password: string }
    if (body.username === 'alice' && body.password === 'password') {
      return HttpResponse.json({
        token: 'test-token-abc',
        expires_at: '2026-06-01T00:00:00Z',
        user: aliceUser,
      })
    }
    return HttpResponse.json({ error: 'invalid username or password' }, { status: 401 })
  }),

  http.post('/api/logout', () => HttpResponse.json({ status: 'ok' })),

  http.get('/api/me', () => HttpResponse.json(aliceUser)),

  http.get('/api/account', () => HttpResponse.json(aliceAccount)),

  http.get('/api/transactions', () => HttpResponse.json([openingDepositTx])),

  http.post('/api/deposit', () =>
    HttpResponse.json({ balance_cents: 130000, balance_formatted: '1300.00' }),
  ),

  http.post('/api/withdraw', () =>
    HttpResponse.json({ balance_cents: 120000, balance_formatted: '1200.00' }),
  ),

  http.post('/api/transfer', () =>
    HttpResponse.json({
      balance_cents: 115000,
      balance_formatted: '1150.00',
      recipient: 'Bob Bennett',
    }),
  ),
]

export const server = setupServer(...handlers)

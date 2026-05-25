import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import Dashboard from './Dashboard'
import { aliceUser, server } from '../test/server'
import type { Transaction } from '../api'

function setup() {
  const onLogout = vi.fn()
  render(<Dashboard user={aliceUser} onLogout={onLogout} />)
  return { onLogout, user: userEvent.setup() }
}

describe('<Dashboard /> initial load', () => {
  it('renders balance and seeded transaction', async () => {
    setup()
    expect(await screen.findByText('$1250.00')).toBeInTheDocument()
    expect(screen.getByText('Opening deposit')).toBeInTheDocument()
  })

  it('shows the empty state when there are no transactions', async () => {
    server.use(http.get('/api/transactions', () => HttpResponse.json([])))
    setup()
    expect(await screen.findByText(/no transactions yet/i)).toBeInTheDocument()
  })

  it('calls onLogout when Sign out is clicked', async () => {
    const { onLogout, user } = setup()
    await user.click(screen.getByRole('button', { name: /sign out/i }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})

describe('<Dashboard /> tab switching', () => {
  it('reveals the recipient input only on the Transfer tab', async () => {
    const { user } = setup()
    await screen.findByText('Opening deposit')

    expect(screen.queryByLabelText(/recipient account/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^transfer$/i }))
    expect(screen.getByLabelText(/recipient account/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^deposit$/i }))
    expect(screen.queryByLabelText(/recipient account/i)).not.toBeInTheDocument()
  })
})

describe('<Dashboard /> deposit flow', () => {
  it('refuses empty/zero amount before hitting the API', async () => {
    let called = false
    server.use(
      http.post('/api/deposit', () => {
        called = true
        return HttpResponse.json({ balance_cents: 0, balance_formatted: '0.00' })
      }),
    )
    const { user } = setup()
    await screen.findByText('Opening deposit')
    await user.click(screen.getByRole('button', { name: /deposit funds/i }))
    expect(await screen.findByText(/enter a positive amount/i)).toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('converts dollar input to cents and re-fetches on success', async () => {
    let sent: { amount_cents?: number; description?: string } | null = null
    server.use(
      http.post('/api/deposit', async ({ request }) => {
        sent = (await request.json()) as {
          amount_cents?: number
          description?: string
        }
        return HttpResponse.json({ balance_cents: 130000, balance_formatted: '1300.00' })
      }),
    )
    const newAccount = {
      ...aliceUser,
      balance_cents: 130000,
      balance_formatted: '1300.00',
    }
    let accountCalls = 0
    server.use(
      http.get('/api/account', () => {
        accountCalls += 1
        return HttpResponse.json(accountCalls === 1 ? aliceUserBalance() : newAccount)
      }),
    )

    const { user } = setup()
    await screen.findByText('Opening deposit')

    await user.type(screen.getByLabelText(/amount/i), '12.34')
    await user.type(screen.getByLabelText(/description/i), 'Birthday')
    await user.click(screen.getByRole('button', { name: /deposit funds/i }))

    await waitFor(() => expect(screen.getByText(/deposited \$12\.34/i)).toBeInTheDocument())
    expect(sent).toEqual({ amount_cents: 1234, description: 'Birthday' })
    expect(accountCalls).toBeGreaterThanOrEqual(2)
  })

  it('shows the API error when deposit fails', async () => {
    server.use(
      http.post('/api/deposit', () =>
        HttpResponse.json({ error: 'amount must be positive' }, { status: 400 }),
      ),
    )
    const { user } = setup()
    await screen.findByText('Opening deposit')
    await user.type(screen.getByLabelText(/amount/i), '5')
    await user.click(screen.getByRole('button', { name: /deposit funds/i }))
    expect(await screen.findByText(/amount must be positive/i)).toBeInTheDocument()
  })
})

describe('<Dashboard /> transfer flow', () => {
  it('blocks submission when destination is empty (without calling the API)', async () => {
    let called = false
    server.use(
      http.post('/api/transfer', () => {
        called = true
        return HttpResponse.json({
          balance_cents: 0,
          balance_formatted: '0.00',
          recipient: 'X',
        })
      }),
    )
    const { user } = setup()
    await screen.findByText('Opening deposit')
    await user.click(screen.getByRole('button', { name: /^transfer$/i }))
    await user.type(screen.getByLabelText(/amount/i), '100')
    await user.click(screen.getByRole('button', { name: /send transfer/i }))
    expect(await screen.findByText(/enter a destination account/i)).toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('sends transfer and shows recipient in notice', async () => {
    const { user } = setup()
    await screen.findByText('Opening deposit')
    await user.click(screen.getByRole('button', { name: /^transfer$/i }))
    await user.type(screen.getByLabelText(/recipient account/i), 'ACME-1001-4521')
    await user.type(screen.getByLabelText(/amount/i), '50')
    await user.click(screen.getByRole('button', { name: /send transfer/i }))
    expect(await screen.findByText(/sent \$50 to bob bennett/i)).toBeInTheDocument()
  })
})

describe('TxRow rendering', () => {
  it('renders positive and negative amounts with correct sign and color', async () => {
    const txs: Transaction[] = [
      {
        id: 1,
        kind: 'transfer_in',
        amount_cents: 5000,
        amount_formatted: '50.00',
        balance_after_cents: 130000,
        balance_after_formatted: '1300.00',
        description: 'From Bob',
        counterparty: 'Bob Bennett',
        created_at: '2026-05-01T00:00:00Z',
      },
      {
        id: 2,
        kind: 'transfer_out',
        amount_cents: -2500,
        amount_formatted: '-25.00',
        balance_after_cents: 127500,
        balance_after_formatted: '1275.00',
        description: 'To Bob',
        counterparty: 'Bob Bennett',
        created_at: '2026-05-02T00:00:00Z',
      },
      {
        id: 3,
        kind: 'deposit',
        amount_cents: 100,
        amount_formatted: '1.00',
        balance_after_cents: 127600,
        balance_after_formatted: '1276.00',
        description: 'Tip',
        created_at: '2026-05-03T00:00:00Z',
      },
      {
        id: 4,
        kind: 'withdraw',
        amount_cents: -100,
        amount_formatted: '-1.00',
        balance_after_cents: 127500,
        balance_after_formatted: '1275.00',
        description: 'Coffee',
        created_at: '2026-05-04T00:00:00Z',
      },
    ]
    server.use(http.get('/api/transactions', () => HttpResponse.json(txs)))
    setup()
    expect(await screen.findByText('From Bob')).toBeInTheDocument()

    expect(screen.getByText('+$50.00')).toBeInTheDocument()
    expect(screen.getByText('-$25.00')).toBeInTheDocument()
    expect(screen.getByText('+$1.00')).toBeInTheDocument()
    expect(screen.getByText('-$1.00')).toBeInTheDocument()

    expect(screen.getByText(/^Transfer in · Bob Bennett/)).toBeInTheDocument()
    expect(screen.getByText(/^Transfer out · Bob Bennett/)).toBeInTheDocument()
    // 'Deposit' / 'Withdrawal' as kind labels live in the tx row's meta line,
    // which starts with the label and a separator dot — disambiguates from the
    // tab/button copy on the action form.
    expect(screen.getByText(/^Deposit · /)).toBeInTheDocument()
    expect(screen.getByText(/^Withdrawal · /)).toBeInTheDocument()
  })
})

// Helper kept inline to avoid polluting test/server.ts with mutable balances.
function aliceUserBalance() {
  return {
    ...aliceUser,
    balance_cents: 125000,
    balance_formatted: '1250.00',
  }
}

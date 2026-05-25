import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  LogOut,
  Send,
  Wallet,
} from 'lucide-react'
import { api, Account, Transaction, User } from '../api'

interface Props {
  user: User
  onLogout: () => void
}

type ActionTab = 'deposit' | 'withdraw' | 'transfer'

export default function Dashboard({ user, onLogout }: Props) {
  const [account, setAccount] = useState<Account | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [tab, setTab] = useState<ActionTab>('deposit')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [toAccount, setToAccount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([api.account(), api.transactions()])
      setAccount(a)
      setTransactions(t)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function submitAction(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    const cents = Math.round(parseFloat(amount) * 100)
    if (!cents || cents <= 0) {
      setError('Enter a positive amount')
      return
    }
    setBusy(true)
    try {
      if (tab === 'deposit') {
        await api.deposit(cents, description || undefined)
        setNotice(`Deposited $${amount}`)
      } else if (tab === 'withdraw') {
        await api.withdraw(cents, description || undefined)
        setNotice(`Withdrew $${amount}`)
      } else {
        if (!toAccount.trim()) {
          setError('Enter a destination account')
          setBusy(false)
          return
        }
        const res = await api.transfer(toAccount.trim(), cents, description || undefined)
        setNotice(`Sent $${amount} to ${res.recipient}`)
      }
      setAmount('')
      setDescription('')
      setToAccount('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand-600 p-2 text-white">
              <Building2 size={20} />
            </div>
            <div>
              <div className="text-lg font-bold text-slate-900">Acme Banking</div>
              <div className="text-xs text-slate-500">Welcome back, {user.full_name}</div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <section className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-500 p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 text-sm text-brand-100">
            <Wallet size={16} />
            Current balance
          </div>
          <div className="mt-2 font-mono text-4xl font-bold tracking-tight">
            ${account?.balance_formatted ?? '—'}
          </div>
          <div className="mt-3 text-sm text-brand-100">
            Account <span className="font-mono">{user.account_number}</span>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Quick action</h2>
            <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
              <TabButton active={tab === 'deposit'} onClick={() => setTab('deposit')}>
                <ArrowDownToLine size={14} /> Deposit
              </TabButton>
              <TabButton active={tab === 'withdraw'} onClick={() => setTab('withdraw')}>
                <ArrowUpFromLine size={14} /> Withdraw
              </TabButton>
              <TabButton active={tab === 'transfer'} onClick={() => setTab('transfer')}>
                <Send size={14} /> Transfer
              </TabButton>
            </div>

            <form onSubmit={submitAction} className="space-y-3">
              {tab === 'transfer' && (
                <div>
                  <label htmlFor="action-to-account" className="mb-1 block text-sm font-medium text-slate-700">
                    Recipient account
                  </label>
                  <input
                    id="action-to-account"
                    type="text"
                    value={toAccount}
                    onChange={(e) => setToAccount(e.target.value)}
                    placeholder="ACME-1001-4521"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </div>
              )}

              <div>
                <label htmlFor="action-amount" className="mb-1 block text-sm font-medium text-slate-700">Amount (USD)</label>
                <input
                  id="action-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              <div>
                <label htmlFor="action-description" className="mb-1 block text-sm font-medium text-slate-700">
                  Description <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  id="action-description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Rent"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              )}
              {notice && (
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? 'Processing…' : labelFor(tab)}
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Recent activity</h2>
            <div className="space-y-2">
              {transactions.length === 0 && (
                <div className="text-sm text-slate-500">No transactions yet.</div>
              )}
              {transactions.map((t) => (
                <TxRow key={t.id} tx={t} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function labelFor(tab: ActionTab): string {
  switch (tab) {
    case 'deposit':
      return 'Deposit funds'
    case 'withdraw':
      return 'Withdraw funds'
    case 'transfer':
      return 'Send transfer'
  }
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition ${
        active ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  )
}

function TxRow({ tx }: { tx: Transaction }) {
  const positive = tx.amount_cents >= 0
  const sign = positive ? '+' : '-'
  const absAmount = tx.amount_formatted.replace('-', '')
  const label = kindLabel(tx.kind)
  const metaText = `${label}${tx.counterparty ? ` · ${tx.counterparty}` : ''} · ${new Date(tx.created_at).toLocaleString()}`
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
      <div>
        <div className="text-sm font-medium text-slate-900">{tx.description}</div>
        <div className="text-xs text-slate-500">{metaText}</div>
      </div>
      <div className={`font-mono text-sm font-semibold ${positive ? 'text-emerald-600' : 'text-slate-700'}`}>
        {`${sign}$${absAmount}`}
      </div>
    </div>
  )
}

function kindLabel(kind: Transaction['kind']): string {
  switch (kind) {
    case 'deposit':
      return 'Deposit'
    case 'withdraw':
      return 'Withdrawal'
    case 'transfer_in':
      return 'Transfer in'
    case 'transfer_out':
      return 'Transfer out'
  }
}

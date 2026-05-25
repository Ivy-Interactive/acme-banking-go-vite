import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import Login from './Login'
import { server } from '../test/server'

function setup() {
  const onSuccess = vi.fn()
  render(<Login onSuccess={onSuccess} />)
  return { onSuccess, user: userEvent.setup() }
}

describe('<Login />', () => {
  it('renders with demo defaults pre-filled', () => {
    setup()
    expect(screen.getByLabelText(/username/i)).toHaveValue('alice')
    expect(screen.getByLabelText(/password/i)).toHaveValue('password')
  })

  it('calls onSuccess with token and user on a successful submit', async () => {
    const { onSuccess, user } = setup()
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(onSuccess).toHaveBeenCalledWith(
      'test-token-abc',
      expect.objectContaining({ username: 'alice' }),
    )
  })

  it('shows the server error message on a failed login', async () => {
    server.use(
      http.post('/api/login', () =>
        HttpResponse.json({ error: 'invalid username or password' }, { status: 401 }),
      ),
    )
    const { onSuccess, user } = setup()
    await user.clear(screen.getByLabelText(/password/i))
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument(),
    )
    expect(onSuccess).not.toHaveBeenCalled()
    // Button re-enabled.
    expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled()
  })

  it('shows "Signing in…" while the request is in flight', async () => {
    let resolveLogin: () => void = () => {}
    server.use(
      http.post('/api/login', () => {
        return new Promise<Response>((resolve) => {
          resolveLogin = () =>
            resolve(
              HttpResponse.json({
                token: 'test-token-abc',
                expires_at: '2026-06-01T00:00:00Z',
                user: {
                  username: 'alice',
                  full_name: 'Alice Anderson',
                  account_number: 'ACME-1001-2034',
                },
              }),
            )
        })
      }),
    )
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('button', { name: /signing in/i })).toBeDisabled()
    resolveLogin()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled(),
    )
  })
})

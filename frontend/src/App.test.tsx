import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import App from './App'
import { server } from './test/server'

describe('<App /> auth gate', () => {
  it('renders Login when no token is in localStorage', async () => {
    let meCalled = false
    server.use(
      http.get('/api/me', () => {
        meCalled = true
        return HttpResponse.json({ username: 'alice', full_name: 'A', account_number: 'A' })
      }),
    )
    render(<App />)
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(meCalled).toBe(false)
  })

  it('renders Dashboard when a valid token is present', async () => {
    localStorage.setItem('acme.token', 'good-token')
    render(<App />)
    expect(await screen.findByText(/welcome back/i)).toBeInTheDocument()
  })

  it('clears token and shows Login when /api/me returns 401', async () => {
    localStorage.setItem('acme.token', 'bad-token')
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json({ error: 'invalid or expired session' }, { status: 401 }),
      ),
    )
    render(<App />)
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(localStorage.getItem('acme.token')).toBeNull()
  })

  it('transitions Login → Dashboard on successful login', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /sign in/i }))
    expect(await screen.findByText(/welcome back/i)).toBeInTheDocument()
    expect(localStorage.getItem('acme.token')).toBe('test-token-abc')
  })

  it('logs out: calls /api/logout, clears token, returns to Login', async () => {
    localStorage.setItem('acme.token', 'good-token')
    let logoutCalled = false
    server.use(
      http.post('/api/logout', () => {
        logoutCalled = true
        return HttpResponse.json({ status: 'ok' })
      }),
    )
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /sign out/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument(),
    )
    expect(logoutCalled).toBe(true)
    expect(localStorage.getItem('acme.token')).toBeNull()
  })

  it('still logs out client-side even if /api/logout fails', async () => {
    localStorage.setItem('acme.token', 'good-token')
    server.use(
      http.post('/api/logout', () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
    )
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /sign out/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument(),
    )
    expect(localStorage.getItem('acme.token')).toBeNull()
  })
})
